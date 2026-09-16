// Almacén del teléfono (IndexedDB).
//
// Acá viven tres cosas: la copia de la caja del día, la copia de los fiados, y
// la cola de lo que todavía no llegó a Supabase.
//
// Por qué IndexedDB y no localStorage: localStorage es sincrónico, así que
// escribir cada venta traba la pantalla en un Android de gama baja, y aguanta
// unos 5 MB de puro texto. Acá se guardan varios días de movimientos y una cola
// que crece si la bodeguera pasa la tarde entera sin señal.
//
// Regla de la casa: nada de acá revienta. Si el navegador no deja abrir la base
// (modo incógnito, almacenamiento bloqueado, cuota llena), `abrirBd()` devuelve
// null y quien llama cae al camino de siempre: hablar directo con Supabase. Se
// pierde el trabajo sin señal, no la app.

const NOMBRE_BD = "mi-bodega-digital";
const VERSION_BD = 1;

export const TIENDA_MOVIMIENTOS = "movimientos";
export const TIENDA_FIADOS = "fiados";
export const TIENDA_PENDIENTES = "pendientes";
export const TIENDA_META = "meta";

let promesaBd: Promise<IDBDatabase | null> | null = null;

export function abrirBd(): Promise<IDBDatabase | null> {
  if (promesaBd) return promesaBd;

  promesaBd = new Promise<IDBDatabase | null>((resolver) => {
    if (typeof indexedDB === "undefined") {
      resolver(null);
      return;
    }

    let solicitud: IDBOpenDBRequest;
    try {
      solicitud = indexedDB.open(NOMBRE_BD, VERSION_BD);
    } catch {
      resolver(null);
      return;
    }

    solicitud.onupgradeneeded = () => {
      const bd = solicitud.result;

      if (!bd.objectStoreNames.contains(TIENDA_MOVIMIENTOS)) {
        const tienda = bd.createObjectStore(TIENDA_MOVIMIENTOS, {
          keyPath: "id",
        });
        // Siempre se consulta "los movimientos de esta bodega en este día".
        tienda.createIndex("por_dia", "clave_dia", { unique: false });
      }

      if (!bd.objectStoreNames.contains(TIENDA_FIADOS)) {
        const tienda = bd.createObjectStore(TIENDA_FIADOS, { keyPath: "id" });
        tienda.createIndex("por_bodega", "merchant_id", { unique: false });
      }

      if (!bd.objectStoreNames.contains(TIENDA_PENDIENTES)) {
        // `seq` autoincremental: la cola se sube en el mismo orden en que la
        // bodeguera anotó. Si primero creó al cliente y después le fió, no se
        // puede invertir.
        bd.createObjectStore(TIENDA_PENDIENTES, {
          keyPath: "seq",
          autoIncrement: true,
        });
      }

      if (!bd.objectStoreNames.contains(TIENDA_META)) {
        bd.createObjectStore(TIENDA_META, { keyPath: "clave" });
      }
    };

    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => resolver(null);
    // Otra pestaña con una versión vieja abierta: no la peleamos.
    solicitud.onblocked = () => resolver(null);
  });

  return promesaBd;
}

function esperar<T>(solicitud: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

/** Corre algo contra una tienda. Devuelve `null` si no hay almacén. */
export async function conTienda<T>(
  nombre: string,
  modo: IDBTransactionMode,
  trabajo: (tienda: IDBObjectStore) => Promise<T>,
): Promise<T | null> {
  const bd = await abrirBd();
  if (!bd) return null;

  try {
    const tx = bd.transaction(nombre, modo);

    // El `oncomplete` se engancha ANTES de trabajar: si se enganchara después,
    // una transacción rápida podría haber cerrado ya y la espera se quedaría
    // colgada para siempre. Esperamos el commit porque decirle "guardado" a la
    // bodeguera antes de que el disco lo tenga sería mentirle.
    const confirmado =
      modo === "readwrite"
        ? new Promise<void>((resolver, rechazar) => {
            tx.oncomplete = () => resolver();
            tx.onerror = () => rechazar(tx.error);
            tx.onabort = () => rechazar(tx.error);
          })
        : Promise.resolve();

    const resultado = await trabajo(tx.objectStore(nombre));
    await confirmado;

    return resultado;
  } catch {
    return null;
  }
}

export async function leerPorIndice<T>(
  nombre: string,
  indice: string,
  valor: IDBValidKey,
): Promise<T[]> {
  const filas = await conTienda<T[]>(nombre, "readonly", (tienda) =>
    esperar(tienda.index(indice).getAll(valor) as IDBRequest<T[]>),
  );
  return filas ?? [];
}

export async function leerTodo<T>(nombre: string): Promise<T[]> {
  const filas = await conTienda<T[]>(nombre, "readonly", (tienda) =>
    esperar(tienda.getAll() as IDBRequest<T[]>),
  );
  return filas ?? [];
}

/** Guarda una marca suelta (por ejemplo, cuándo se bajó un día). */
export async function guardarMeta(clave: string, valor: string): Promise<void> {
  await conTienda(TIENDA_META, "readwrite", async (tienda) => {
    await esperar(tienda.put({ clave, valor }));
  });
}

export async function leerMeta(clave: string): Promise<string | null> {
  const fila = await conTienda<{ clave: string; valor: string } | undefined>(
    TIENDA_META,
    "readonly",
    (tienda) =>
      esperar(
        tienda.get(clave) as IDBRequest<{ clave: string; valor: string } | undefined>,
      ),
  );
  return fila?.valor ?? null;
}

/** Borra todo lo del teléfono. Se llama al cerrar sesión. */
export async function vaciarAlmacen(): Promise<void> {
  for (const tienda of [
    TIENDA_MOVIMIENTOS,
    TIENDA_FIADOS,
    TIENDA_PENDIENTES,
    TIENDA_META,
  ]) {
    await conTienda(tienda, "readwrite", async (t) => {
      await esperar(t.clear());
    });
  }
}

export { esperar };
