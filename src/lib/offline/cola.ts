// La cola de lo que todavía no llegó a Supabase, y cómo se sube.
//
// Regla de oro: la bodeguera aprieta "Guardar" y eso queda escrito en el
// teléfono ANTES de tocar la red. Recién después intentamos subirlo. Así la
// venta existe aunque se corte la señal, se cierre la app o se apague el
// celular en el segundo siguiente.
//
// Idempotencia: cada fila lleva un id generado en el teléfono. Si un reintento
// vuelve a mandar el mismo INSERT, Postgres lo rechaza por llave primaria
// duplicada y eso lo leemos como "ya estaba arriba". Los ajustes de fiado no
// pueden resolverse así (no crean fila, mueven un número), y se explican abajo
// en `subirAjusteFiado`.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerDebt } from "@/types/database";
import { diaLocalDeISO } from "@/lib/fechas";
import { TIENDA_PENDIENTES, conTienda, esperar, leerTodo } from "./db";
import {
  ponerCambiosEnCopia,
  ponerFiadoEnCopia,
  ponerMovimientoEnCopia,
  ponerSaldoEnCopia,
  quitarMovimientoDeCopia,
} from "./almacen";
import {
  esDuplicado,
  esErrorDeRed,
  esPermisoDenegado,
  esSaldoNegativo,
  esSesionCaida,
  faltaLaFuncion,
  type ErrorSupabase,
} from "./errores";
import type {
  CambiosMovimiento,
  Operacion,
  Pendiente,
  PendienteNuevo,
  ResultadoSubida,
} from "./tipos";

// ---------------------------------------------------------------------------
// Aviso a las pantallas
// ---------------------------------------------------------------------------

type Oyente = () => void;
const oyentes = new Set<Oyente>();

export function suscribirseACola(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function avisar(): void {
  for (const oyente of oyentes) oyente();
}

// ---------------------------------------------------------------------------
// Lectura y escritura de la cola
// ---------------------------------------------------------------------------

export async function leerCola(merchantId: string): Promise<Pendiente[]> {
  const todos = await leerTodo<Pendiente>(TIENDA_PENDIENTES);
  return todos
    .filter((p) => p.merchantId === merchantId)
    .sort((a, b) => a.seq - b.seq);
}

async function encolar(nuevo: PendienteNuevo): Promise<number | null> {
  const seq = await conTienda<number>(
    TIENDA_PENDIENTES,
    "readwrite",
    async (tienda) => {
      const clave = await esperar(tienda.add(nuevo) as IDBRequest<IDBValidKey>);
      return Number(clave);
    },
  );

  if (seq !== null) avisar();
  return seq;
}

async function sacarDeCola(seq: number): Promise<void> {
  await conTienda(TIENDA_PENDIENTES, "readwrite", async (tienda) => {
    await esperar(tienda.delete(seq));
  });
}

async function guardarEnCola(pendiente: Pendiente): Promise<void> {
  await conTienda(TIENDA_PENDIENTES, "readwrite", async (tienda) => {
    await esperar(tienda.put(pendiente));
  });
}

/**
 * Tirar a la basura algo que quedó trabado.
 *
 * Lo llama la bodeguera a propósito, después de leer qué era y de confirmarlo,
 * nunca el código por su cuenta. Borra plata que no está en ningún otro lado.
 */
export async function descartarPendiente(seq: number): Promise<void> {
  await sacarDeCola(seq);
  avisar();
}

/**
 * Volver a poner en la fila algo que había quedado trabado.
 *
 * Sin esto, un trabado no se destrababa NUNCA: la pasada de subida lo salta, y
 * se comprobó que con una sesión nueva y buena la app hacía cero intentos de
 * volver a mandarlo. La única salida era borrarlo. Con esto, lo que se trabó
 * porque la cuenta se había cerrado vuelve a subir apenas ella entra de nuevo.
 */
export async function reintentarPendiente(
  merchantId: string,
  seq: number,
): Promise<void> {
  const cola = await leerCola(merchantId);
  const pendiente = cola.find((p) => p.seq === seq);
  if (!pendiente) return;

  pendiente.trabado = false;
  pendiente.motivo = null;
  pendiente.intentos = 0;

  await guardarEnCola(pendiente);
  avisar();
}

/** Destraba todo de una: sirve después de volver a entrar. */
export async function reintentarTodo(merchantId: string): Promise<number> {
  const cola = await leerCola(merchantId);
  const trabados = cola.filter((p) => p.trabado);

  for (const pendiente of trabados) {
    pendiente.trabado = false;
    pendiente.motivo = null;
    pendiente.intentos = 0;
    await guardarEnCola(pendiente);
  }

  if (trabados.length > 0) avisar();
  return trabados.length;
}

/** Si el movimiento todavía no subió, se edita en la cola y no viaja nunca la versión vieja. */
export async function editarMovimientoEnCola(
  merchantId: string,
  idMovimiento: string,
  cambios: CambiosMovimiento,
): Promise<boolean> {
  const cola = await leerCola(merchantId);
  const pendiente = cola.find(
    (p) => p.op.tipo === "crear_movimiento" && p.op.fila.id === idMovimiento,
  );
  if (!pendiente || pendiente.op.tipo !== "crear_movimiento") return false;

  pendiente.op = {
    tipo: "crear_movimiento",
    fila: { ...pendiente.op.fila, ...cambios },
  };
  pendiente.trabado = false;
  pendiente.motivo = null;

  await guardarEnCola(pendiente);
  avisar();
  return true;
}

/** Si el movimiento nunca llegó al servidor, borrarlo es sacarlo de la cola. */
export async function borrarMovimientoDeCola(
  merchantId: string,
  idMovimiento: string,
): Promise<boolean> {
  const cola = await leerCola(merchantId);
  const pendiente = cola.find(
    (p) => p.op.tipo === "crear_movimiento" && p.op.fila.id === idMovimiento,
  );
  if (!pendiente) return false;

  await sacarDeCola(pendiente.seq);
  avisar();
  return true;
}

// ---------------------------------------------------------------------------
// Anotar: primero el teléfono, después la red
// ---------------------------------------------------------------------------

export function armarPendiente(
  merchantId: string,
  opId: string,
  op: Operacion,
): PendienteNuevo {
  return {
    opId,
    merchantId,
    creadoEn: new Date().toISOString(),
    intentos: 0,
    trabado: false,
    motivo: null,
    op,
  };
}

/**
 * Deja la operación anotada y devuelve si quedó a salvo.
 *
 * `ok: false` significa que no se guardó ni en el teléfono ni en el servidor:
 * quien llama TIENE que avisarlo y no vaciar el formulario. `ok: true` significa
 * que ya está escrita en el teléfono, aunque todavía no haya subido.
 */
export async function anotar(
  supabase: SupabaseClient,
  nuevo: PendienteNuevo,
): Promise<{ ok: boolean; enCola: boolean; mensaje?: string }> {
  const seq = await encolar(nuevo);

  if (seq !== null) {
    // Se intenta subir ya mismo, pero sin hacer esperar a la pantalla: si no
    // hay señal, la cola se encarga cuando vuelva.
    void subirPendientes(supabase, nuevo.merchantId);
    return { ok: true, enCola: true };
  }

  // Sin almacén local (modo incógnito, cuota llena): se cae al camino de
  // siempre, hablar directo con Supabase. Se pierde el trabajo sin señal, no
  // la operación.
  const desenlace = await ejecutar(supabase, { ...nuevo, seq: -1 });

  if (desenlace.estado === "ok") return { ok: true, enCola: false };
  if (desenlace.estado === "sin_senal") {
    return {
      ok: false,
      enCola: false,
      mensaje:
        "Sin señal y este teléfono no deja guardar en su memoria. No se anotó: intenta de nuevo cuando vuelva el internet.",
    };
  }
  if (desenlace.estado === "sesion") {
    return {
      ok: false,
      enCola: false,
      mensaje:
        "Tu cuenta se cerró sola y este teléfono no deja guardar en su memoria. No se anotó: vuelve a entrar e inténtalo otra vez.",
    };
  }
  return { ok: false, enCola: false, mensaje: desenlace.motivo };
}

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------

type Desenlace =
  | { estado: "ok"; saldo?: number }
  | { estado: "sin_senal" }
  /** Falta la credencial, no falla la anotación: se pausa, no se traba. */
  | { estado: "sesion" }
  | { estado: "trabado"; motivo: string };

/**
 * Pasar a la copia local lo que acaba de subir.
 *
 * Sin esto queda un hueco feo: la anotación sale de la cola porque ya subió,
 * pero la pantalla todavía no le preguntó al servidor, así que el movimiento
 * desaparece un instante de la lista y el total baja y vuelve a subir.
 */
async function reflejarEnCopia(
  pendiente: Pendiente,
  desenlace: Extract<Desenlace, { estado: "ok" }>,
): Promise<void> {
  const op = pendiente.op;

  switch (op.tipo) {
    case "crear_movimiento":
      await ponerMovimientoEnCopia(op.fila, diaLocalDeISO(op.fila.created_at));
      return;
    case "editar_movimiento":
      await ponerCambiosEnCopia(op.id, op.cambios);
      return;
    case "borrar_movimiento":
      await quitarMovimientoDeCopia(op.id);
      return;
    case "crear_fiado":
      await ponerFiadoEnCopia(op.fila);
      return;
    case "ajustar_fiado":
      if (desenlace.saldo !== undefined && Number.isFinite(desenlace.saldo)) {
        await ponerSaldoEnCopia(op.debtId, desenlace.saldo);
      }
      return;
  }
}

function soles(monto: number): string {
  return `S/ ${Number(monto).toFixed(2)}`;
}

function centimos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

async function ejecutar(
  supabase: SupabaseClient,
  pendiente: Pendiente,
): Promise<Desenlace> {
  const op = pendiente.op;

  switch (op.tipo) {
    case "crear_movimiento": {
      const { error } = await supabase.from("transactions").insert([op.fila]);
      if (!error) return { estado: "ok" };
      // Llave primaria repetida = este mismo movimiento ya subió en un intento
      // anterior cuya respuesta nunca llegó. No es un error: es el final feliz.
      if (esDuplicado(error)) return { estado: "ok" };
      if (esErrorDeRed(error)) return { estado: "sin_senal" };
      if (esSesionCaida(error)) return { estado: "sesion" };
      return {
        estado: "trabado",
        motivo: `No se pudo subir ${op.fila.type === "expense" ? "el gasto" : "la venta"} de ${soles(op.fila.amount)}: ${mensajeCorto(error)}`,
      };
    }

    case "editar_movimiento": {
      const { data, error } = await supabase
        .from("transactions")
        .update(op.cambios)
        .eq("id", op.id)
        .select();

      if (error) {
        if (esErrorDeRed(error)) return { estado: "sin_senal" };
        if (esSesionCaida(error)) return { estado: "sesion" };
        return {
          estado: "trabado",
          motivo: `No se pudo guardar el cambio del movimiento de ${soles(op.cambios.amount)}: ${mensajeCorto(error)}`,
        };
      }

      if (!data || data.length === 0) {
        return {
          estado: "trabado",
          motivo: `El movimiento de ${soles(op.cambios.amount)} que editaste ya no existe en el servidor. Anótalo de nuevo si hace falta.`,
        };
      }
      return { estado: "ok" };
    }

    case "borrar_movimiento": {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", op.id);
      if (!error) return { estado: "ok" }; // Borrar dos veces da lo mismo.
      if (esErrorDeRed(error)) return { estado: "sin_senal" };
      if (esSesionCaida(error)) return { estado: "sesion" };
      return {
        estado: "trabado",
        motivo: `No se pudo borrar un movimiento: ${mensajeCorto(error)}`,
      };
    }

    case "crear_fiado": {
      const { error } = await supabase
        .from("customers_debts")
        .insert([op.fila]);
      if (!error) return { estado: "ok" };
      if (esDuplicado(error)) return { estado: "ok" };
      if (esErrorDeRed(error)) return { estado: "sin_senal" };
      if (esSesionCaida(error)) return { estado: "sesion" };
      return {
        estado: "trabado",
        motivo: `No se pudo guardar al cliente ${op.fila.customer_name}: ${mensajeCorto(error)}`,
      };
    }

    case "ajustar_fiado":
      return subirAjusteFiado(supabase, pendiente.opId, op);
  }
}

/**
 * El porqué del rechazo, en castellano.
 *
 * Antes esto reenviaba el texto crudo de Postgres y la bodeguera terminaba
 * leyendo "new row violates row-level security policy for table transactions".
 * El código se conserva al final para que quien dé soporte sepa qué pasó sin
 * tener que adivinar.
 */
function mensajeCorto(error: ErrorSupabase): string {
  if (esSesionCaida(error)) {
    return "tu cuenta se cerró sola; vuelve a entrar y toca Reintentar";
  }
  if (esPermisoDenegado(error)) {
    return "el servidor no lo aceptó; si acabas de volver a entrar, toca Reintentar";
  }
  if (esSaldoNegativo(error)) {
    return "al servidor no le cuadra ese monto";
  }
  const codigo = error.code ? ` (código ${error.code})` : "";
  return `el servidor lo rechazó${codigo}`;
}

/**
 * Subir un "Fió más" o un "Abonó" anotado sin señal.
 *
 * El problema real: mientras el teléfono estaba sin señal, el saldo de ese
 * cliente pudo cambiar en el servidor (la misma cuenta abierta en otro celular,
 * el hijo atendiendo en la tarde). Por eso NUNCA se manda el saldo final que se
 * calculó offline: se manda la diferencia y el servidor la suma sobre lo que
 * tenga en ese momento. Mandar el total sería borrar el movimiento del otro
 * teléfono sin que nadie se entere.
 *
 * Quedan dos caminos:
 *
 *  1. `aplicar_movimiento_fiado`, la función que instala
 *     `supabase/01-endurecer-esquema.sql`. Suma la diferencia y anota el `opId`
 *     en una bitácora con llave primaria, todo en la misma transacción. Un
 *     reintento vuelve a chocar con ese `opId` y no cobra dos veces. Es el
 *     camino correcto y el único con exactamente-una-vez de verdad.
 *
 *  2. Si esa función todavía no está instalada, un compare-and-swap: leer el
 *     saldo, escribir el nuevo condicionando a que el saldo siga siendo el que
 *     leímos (`.eq("balance", actual)`). Si otro teléfono lo movió en el medio,
 *     no toca ninguna fila y se reintenta con el valor fresco. Protege contra
 *     pisar al otro celular, pero NO contra el caso raro de que la respuesta se
 *     pierda después de que el servidor ya aplicó el cambio: ahí el reintento
 *     sumaría de nuevo. Corre el guion SQL para cerrar esa ventana.
 */
async function subirAjusteFiado(
  supabase: SupabaseClient,
  opId: string,
  op: Extract<Operacion, { tipo: "ajustar_fiado" }>,
): Promise<Desenlace> {
  const rpc = await supabase.rpc("aplicar_movimiento_fiado", {
    p_op_id: opId,
    p_debt_id: op.debtId,
    p_delta: op.delta,
  });

  if (!rpc.error) return { estado: "ok", saldo: Number(rpc.data) };
  if (esErrorDeRed(rpc.error)) return { estado: "sin_senal" };
  if (esSesionCaida(rpc.error)) return { estado: "sesion" };
  if (esSaldoNegativo(rpc.error)) return trabadoPorSaldo(op);
  if (!faltaLaFuncion(rpc.error)) {
    return {
      estado: "trabado",
      motivo: `No se pudo aplicar ${describirAjuste(op)}: ${mensajeCorto(rpc.error)}`,
    };
  }

  // Camino 2: compare-and-swap.
  for (let intento = 0; intento < 4; intento++) {
    const lectura = await supabase
      .from("customers_debts")
      .select("balance")
      .eq("id", op.debtId)
      .limit(1);

    if (lectura.error) {
      if (esErrorDeRed(lectura.error)) return { estado: "sin_senal" };
      if (esSesionCaida(lectura.error)) return { estado: "sesion" };
      return {
        estado: "trabado",
        motivo: `No se pudo aplicar ${describirAjuste(op)}: ${mensajeCorto(lectura.error)}`,
      };
    }

    const fila = (lectura.data as { balance: number }[] | null)?.[0];
    if (!fila) {
      return {
        estado: "trabado",
        motivo: `${op.nombre} ya no está en la lista de fiados, así que ${describirAjuste(op)} no se pudo aplicar. Vuelve a registrarlo.`,
      };
    }

    const actual = Number(fila.balance);
    const nuevo = centimos(actual + op.delta);

    if (nuevo < 0) return trabadoPorSaldo(op, actual);

    const escritura = await supabase
      .from("customers_debts")
      .update({ balance: nuevo, updated_at: new Date().toISOString() })
      .eq("id", op.debtId)
      .eq("balance", actual)
      .select();

    if (escritura.error) {
      if (esErrorDeRed(escritura.error)) return { estado: "sin_senal" };
      if (esSesionCaida(escritura.error)) return { estado: "sesion" };
      if (esSaldoNegativo(escritura.error)) return trabadoPorSaldo(op, actual);
      return {
        estado: "trabado",
        motivo: `No se pudo aplicar ${describirAjuste(op)}: ${mensajeCorto(escritura.error)}`,
      };
    }

    if (escritura.data && escritura.data.length > 0) {
      return { estado: "ok", saldo: nuevo };
    }
    // Cero filas: el saldo cambió entre la lectura y la escritura. Se relee.
  }

  return {
    estado: "trabado",
    motivo: `${describirAjuste(op)} no se pudo aplicar: el saldo de ${op.nombre} está cambiando desde otro teléfono. Revísalo y anótalo a mano.`,
  };
}

function trabadoPorSaldo(
  op: Extract<Operacion, { tipo: "ajustar_fiado" }>,
  saldoServidor?: number,
): Desenlace {
  const cuanto =
    saldoServidor === undefined ? "" : ` Ahora debe ${soles(saldoServidor)}.`;
  return {
    estado: "trabado",
    motivo: `El abono de ${soles(Math.abs(op.delta))} de ${op.nombre} ya no cabe en su deuda: alguien la cobró desde otro teléfono.${cuanto} Nada se recortó solo. Revisa cuánto le toca de vuelto: si lo arreglaste, toca Reintentar.`,
  };
}

export function describirAjuste(
  op: Extract<Operacion, { tipo: "ajustar_fiado" }>,
): string {
  return op.delta >= 0
    ? `el fiado de ${soles(op.delta)} de ${op.nombre}`
    : `el abono de ${soles(-op.delta)} de ${op.nombre}`;
}

/**
 * Qué se lleva por delante el botón de borrar, dicho con el monto.
 *
 * "Descartar" a secas no le dice a nadie que está tirando una venta de S/ 15.
 * El botón tiene que nombrar la plata, porque es lo único que se pierde y no
 * hay de dónde recuperarla.
 */
export function textoDeBorrado(pendiente: Pendiente): {
  boton: string;
  pregunta: string;
  detalle: string;
} {
  const op = pendiente.op;

  if (op.tipo === "ajustar_fiado") {
    const que =
      op.delta >= 0
        ? `el fiado de ${soles(op.delta)}`
        : `el abono de ${soles(-op.delta)}`;
    return {
      boton: `Borrar ${que}`,
      pregunta: `¿Borrar ${que} de ${op.nombre}?`,
      detalle: `La deuda de ${op.nombre} se queda como está en el servidor. Si el dinero cambió de manos, vas a tener que anotarlo de nuevo a mano.`,
    };
  }

  const que = describirPendiente(pendiente).toLowerCase();
  return {
    boton: `Borrar ${que}`,
    pregunta: `¿Borrar ${que}?`,
    detalle:
      "No se va a mandar nunca y no hay cómo recuperarla. Solo está en este teléfono.",
  };
}

/** Texto para el aviso rojo de lo que quedó trabado. */
export function describirPendiente(pendiente: Pendiente): string {
  const op = pendiente.op;
  switch (op.tipo) {
    case "crear_movimiento":
      return `${op.fila.type === "expense" ? "Gasto" : "Venta"} de ${soles(op.fila.amount)}`;
    case "editar_movimiento":
      return `Cambio a un movimiento (${soles(op.cambios.amount)})`;
    case "borrar_movimiento":
      return "Borrado de un movimiento";
    case "crear_fiado":
      return `Cliente nuevo: ${op.fila.customer_name}`;
    case "ajustar_fiado":
      return describirAjuste(op).replace(/^el /, "El ");
  }
}

let subidasTotales = 0;

/**
 * Cuántas anotaciones subieron desde que se abrió la app.
 *
 * Las pantallas lo miran para volver a preguntarle al servidor cuando algo
 * sube: la subida puede dispararse desde cualquier lado (al anotar, al volver
 * la señal, al desbloquear el celular), así que no alcanza con enterarse solo
 * de las que pidió esta pantalla.
 */
export function contadorDeSubidas(): number {
  return subidasTotales;
}

type EstadoSesion = "ok" | "caida" | "sin_senal";

/**
 * ¿Hay sesión con qué subir?
 *
 * `getSession()` lee del teléfono y, si el token venció, intenta renovarlo. Si
 * devuelve sesión, se sube. Si no:
 *
 *  - con el teléfono sin red, lo más probable es que la renovación no haya
 *    podido salir. Eso es falta de señal, no una cuenta caída: se espera.
 *  - con red, la cuenta se cerró de verdad (el refresh token murió por
 *    rotación, por una restauración de copia o por meses sin entrar). Ahí sí
 *    hay que decírselo y pedirle que vuelva a entrar.
 *
 * En los dos casos la cola queda intacta.
 */
async function revisarSesion(supabase: SupabaseClient): Promise<EstadoSesion> {
  let hayApertura: boolean;

  try {
    const { data } = await supabase.auth.getSession();
    hayApertura = Boolean(data.session);
  } catch {
    // No se pudo ni preguntar (el candado de la sesión ocupado, por ejemplo).
    // Eso NO es motivo para parar la cola y menos para decirle a la bodeguera
    // que su cuenta se cerró: se intenta igual y que conteste el servidor. Si
    // el token está vencido de verdad, vuelve con PGRST303 y se pausa ahí.
    return "ok";
  }

  if (hayApertura) return "ok";

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "sin_senal";
  }
  return "caida";
}

let enCurso: Promise<ResultadoSubida> | null = null;
let enEspera: Promise<ResultadoSubida> | null = null;

/**
 * Sube la cola, de a una pasada por vez.
 *
 * La subida se dispara desde varios lados a la vez (al anotar, al volver la
 * señal, al desbloquear el celular, cada 20 segundos). Dos pasadas en paralelo
 * subirían la misma anotación dos veces. Antes esto se resolvía con un simple
 * "si ya hay una corriendo, no hago nada", y salió mal: apretar "Subir" durante
 * una pasada no hacía absolutamente nada y el contador se quedaba clavado. Ahora
 * el pedido queda encolado detrás del que está corriendo; con uno esperando
 * alcanza, encadenar diez no sube nada extra.
 */
export function subirPendientes(
  supabase: SupabaseClient,
  merchantId: string,
): Promise<ResultadoSubida> {
  if (!enCurso) {
    enCurso = correrSubida(supabase, merchantId).finally(() => {
      enCurso = null;
    });
    return enCurso;
  }

  if (!enEspera) {
    enEspera = enCurso
      .catch(() => undefined)
      .then(() => {
        enEspera = null;
        return subirPendientes(supabase, merchantId);
      });
  }

  return enEspera;
}

/**
 * Una pasada. Se detiene en cuanto una operación se queda sin señal: el orden
 * importa (primero se crea el cliente, después se le fía) y quemar reintentos
 * contra una red caída no ayuda a nadie.
 */
async function correrSubida(
  supabase: SupabaseClient,
  merchantId: string,
): Promise<ResultadoSubida> {
  let subidos = 0;
  let sinSenal = false;
  let sesionCaida = false;

  try {
    const cola = await leerCola(merchantId);

    // Antes de tocar nada: ¿hay con qué entrar?
    //
    // Esto se mira ACÁ y no en el error de vuelta porque supabase-js, cuando no
    // puede renovar la sesión, manda la clave anónima igual, y el servidor
    // responde 403 de RLS. Adivinarlo por el error obligaría a tratar todo 403
    // como "falta sesión", y un permiso mal puesto de verdad quedaría
    // reintentando en silencio para siempre. Probado contra la base: con la
    // sesión muerta salían tres POST seguidos a 403 y las tres ventas se
    // trababan de una, con texto de Postgres en inglés.
    if (cola.length > 0) {
      const sesion = await revisarSesion(supabase);
      if (sesion !== "ok") {
        // Nadie se traba: la cola queda EN PAUSA, entera, tal cual.
        return {
          subidos: 0,
          restantes: cola.length,
          trabados: cola.filter((p) => p.trabado).length,
          sinSenal: sesion === "sin_senal",
          sesionCaida: sesion === "caida",
        };
      }
    }

    // Si algo quedó trabado, lo que venga después sobre la MISMA fila tampoco
    // puede subir: editar un movimiento que nunca se creó no tiene sentido.
    const trabadas = new Set<string>();

    for (const pendiente of cola) {
      const fila = filaTocada(pendiente.op);

      if (pendiente.trabado) {
        if (fila) trabadas.add(fila);
        continue;
      }

      if (fila && trabadas.has(fila)) {
        pendiente.trabado = true;
        pendiente.motivo = `${describirPendiente(pendiente)}: depende de otro movimiento que no se pudo subir.`;
        await guardarEnCola(pendiente);
        continue;
      }

      const desenlace = await ejecutar(supabase, pendiente);

      if (desenlace.estado === "ok") {
        await reflejarEnCopia(pendiente, desenlace);
        await sacarDeCola(pendiente.seq);
        subidos++;
        continue;
      }

      if (desenlace.estado === "sin_senal") {
        sinSenal = true;
        pendiente.intentos += 1;
        await guardarEnCola(pendiente);
        break;
      }

      // La sesión se cayó en pleno vuelo (el token venció entre que miramos y
      // que mandamos). La anotación está bien: se deja como está y se para.
      if (desenlace.estado === "sesion") {
        sesionCaida = true;
        pendiente.intentos += 1;
        await guardarEnCola(pendiente);
        break;
      }

      pendiente.trabado = true;
      pendiente.intentos += 1;
      pendiente.motivo = desenlace.motivo;
      await guardarEnCola(pendiente);
      if (fila) trabadas.add(fila);
    }

    const restante = await leerCola(merchantId);
    return {
      subidos,
      restantes: restante.length,
      trabados: restante.filter((p) => p.trabado).length,
      sinSenal,
      sesionCaida,
    };
  } finally {
    subidasTotales += subidos;
    avisar();
  }
}

/** Qué fila del servidor toca esta operación, para no subir cosas huérfanas. */
function filaTocada(op: Operacion): string | null {
  switch (op.tipo) {
    case "crear_movimiento":
      return op.fila.id;
    case "editar_movimiento":
    case "borrar_movimiento":
      return op.id;
    case "crear_fiado":
      return op.fila.id;
    case "ajustar_fiado":
      return op.debtId;
  }
}

/** Un fiado recién creado en el teléfono, listo para la cola. */
export function filaDeFiado(
  id: string,
  merchantId: string,
  nombre: string,
  celular: string,
  saldo: number,
): CustomerDebt {
  return {
    id,
    merchant_id: merchantId,
    customer_name: nombre,
    phone_number: celular,
    balance: saldo,
    updated_at: new Date().toISOString(),
  };
}
