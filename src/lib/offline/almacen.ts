// Copia local de lo que dijo el servidor la última vez que hubo señal.
//
// Ojo con qué se guarda acá: SOLO la verdad del servidor. Lo que la bodeguera
// anota sin señal vive en la cola (cola.ts) y se pinta encima al momento de
// mostrar. Mezclar las dos cosas en la misma tabla fue lo primero que se
// descartó: quedaba imposible saber qué cifra venía de Supabase y cuál no, que
// es justo lo que hay que poder decirle al usuario.
import type { CustomerDebt, Transaction } from "@/types/database";
import {
  TIENDA_FIADOS,
  TIENDA_MOVIMIENTOS,
  conTienda,
  esperar,
  guardarMeta,
  leerMeta,
  leerPorIndice,
} from "./db";

type MovimientoGuardado = Transaction & { clave_dia: string };

function claveDia(merchantId: string, dia: string): string {
  return `${merchantId}|${dia}`;
}

function marcaDia(merchantId: string, dia: string): string {
  return `bajado:${claveDia(merchantId, dia)}`;
}

const MARCA_FIADOS = "bajado:fiados";

/** Reemplaza lo guardado de ese día por lo que acaba de contestar el servidor. */
export async function guardarMovimientosDelDia(
  merchantId: string,
  dia: string,
  filas: Transaction[],
): Promise<void> {
  const clave = claveDia(merchantId, dia);

  await conTienda(TIENDA_MOVIMIENTOS, "readwrite", async (tienda) => {
    const viejas = await esperar(
      tienda.index("por_dia").getAllKeys(clave) as IDBRequest<IDBValidKey[]>,
    );
    for (const id of viejas) await esperar(tienda.delete(id));

    for (const fila of filas) {
      const guardada: MovimientoGuardado = { ...fila, clave_dia: clave };
      await esperar(tienda.put(guardada));
    }
  });

  await guardarMeta(marcaDia(merchantId, dia), new Date().toISOString());
}

export async function leerMovimientosDelDia(
  merchantId: string,
  dia: string,
): Promise<{ filas: Transaction[]; bajadoEl: string | null }> {
  const guardadas = await leerPorIndice<MovimientoGuardado>(
    TIENDA_MOVIMIENTOS,
    "por_dia",
    claveDia(merchantId, dia),
  );

  // Se copia campo por campo para que `clave_dia` (que es solo un índice del
  // teléfono) no viaje escondido dentro de un movimiento.
  const filas: Transaction[] = guardadas
    .map((g) => ({
      id: g.id,
      merchant_id: g.merchant_id,
      type: g.type,
      amount: Number(g.amount),
      description: g.description,
      payment_method: g.payment_method,
      created_at: g.created_at,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return { filas, bajadoEl: await leerMeta(marcaDia(merchantId, dia)) };
}

/**
 * Mete en la copia local un movimiento que ACABA de subir.
 *
 * Sin esto, entre que la cola suelta la anotación (ya subió) y que la pantalla
 * vuelve a preguntarle al servidor, la venta desaparece un instante de la
 * lista. Ver un monto parpadear no es un detalle estético cuando es tu plata.
 */
export async function ponerMovimientoEnCopia(
  fila: Transaction,
  dia: string,
): Promise<void> {
  const guardada: MovimientoGuardado = {
    ...fila,
    clave_dia: claveDia(fila.merchant_id, dia),
  };
  await conTienda(TIENDA_MOVIMIENTOS, "readwrite", async (tienda) => {
    await esperar(tienda.put(guardada));
  });
}

export async function ponerCambiosEnCopia(
  id: string,
  cambios: Partial<Transaction>,
): Promise<void> {
  await conTienda(TIENDA_MOVIMIENTOS, "readwrite", async (tienda) => {
    const fila = await esperar(
      tienda.get(id) as IDBRequest<MovimientoGuardado | undefined>,
    );
    if (!fila) return;
    await esperar(tienda.put({ ...fila, ...cambios }));
  });
}

export async function quitarMovimientoDeCopia(id: string): Promise<void> {
  await conTienda(TIENDA_MOVIMIENTOS, "readwrite", async (tienda) => {
    await esperar(tienda.delete(id));
  });
}

export async function guardarFiados(
  merchantId: string,
  filas: CustomerDebt[],
): Promise<void> {
  await conTienda(TIENDA_FIADOS, "readwrite", async (tienda) => {
    const viejas = await esperar(
      tienda.index("por_bodega").getAllKeys(merchantId) as IDBRequest<
        IDBValidKey[]
      >,
    );
    for (const id of viejas) await esperar(tienda.delete(id));
    for (const fila of filas) await esperar(tienda.put(fila));
  });

  await guardarMeta(MARCA_FIADOS, new Date().toISOString());
}

/** Igual que `ponerMovimientoEnCopia`, para un fiado recién subido. */
export async function ponerFiadoEnCopia(fila: CustomerDebt): Promise<void> {
  await conTienda(TIENDA_FIADOS, "readwrite", async (tienda) => {
    await esperar(tienda.put(fila));
  });
}

/** El saldo que devolvió el servidor después de aplicar un "Fió más" o un "Abonó". */
export async function ponerSaldoEnCopia(
  debtId: string,
  saldo: number,
): Promise<void> {
  await conTienda(TIENDA_FIADOS, "readwrite", async (tienda) => {
    const fila = await esperar(
      tienda.get(debtId) as IDBRequest<CustomerDebt | undefined>,
    );
    if (!fila) return;
    await esperar(
      tienda.put({ ...fila, balance: saldo, updated_at: new Date().toISOString() }),
    );
  });
}

export async function leerFiados(
  merchantId: string,
): Promise<{ filas: CustomerDebt[]; bajadoEl: string | null }> {
  const filas = await leerPorIndice<CustomerDebt>(
    TIENDA_FIADOS,
    "por_bodega",
    merchantId,
  );

  filas.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));

  return { filas, bajadoEl: await leerMeta(MARCA_FIADOS) };
}
