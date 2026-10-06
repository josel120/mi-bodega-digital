// Limpiar el teléfono al salir o al borrar la cuenta (S4 de la revisión de
// seguridad del 2026-10-06).
//
// En el celular quedan nombres, celulares y saldos de los clientes del fiado
// (IndexedDB) y los datos de la bodega (localStorage). Muchas bodegas comparten
// el celular con la familia: si al cerrar sesión o borrar la cuenta queda algo,
// el siguiente que abra la app sin señal lo podría ver.
import { olvidarBodega } from "@/lib/merchant";
import { eliminarBd, vaciarAlmacen } from "@/lib/offline/db";

/** Todas las claves propias de la app empiezan así. */
export const PREFIJO_CLAVES = "mi-bodega-digital";

function vaciarClavesPropias(almacen: Storage | undefined): void {
  if (!almacen) return;
  try {
    const propias: string[] = [];
    for (let i = 0; i < almacen.length; i++) {
      const clave = almacen.key(i);
      if (clave?.startsWith(PREFIJO_CLAVES)) propias.push(clave);
    }
    for (const clave of propias) almacen.removeItem(clave);
  } catch {
    // Almacenamiento bloqueado: no hay nada guardado que borrar.
  }
}

function almacenSeguro(nombre: "localStorage" | "sessionStorage"): Storage | undefined {
  try {
    return typeof globalThis[nombre] === "undefined" ? undefined : globalThis[nombre];
  } catch {
    return undefined;
  }
}

/**
 * Borra lo que la app guardó en este teléfono. No toca la sesión de Supabase:
 * eso lo hace `supabase.auth.signOut()`, que quien llama corre después.
 * Nunca revienta: si algo no se puede borrar, sigue con lo demás.
 */
export async function limpiarDispositivo(): Promise<void> {
  olvidarBodega();
  vaciarClavesPropias(almacenSeguro("localStorage"));
  vaciarClavesPropias(almacenSeguro("sessionStorage"));
  try {
    await vaciarAlmacen();
  } catch {
    // Sin IndexedDB: nada que vaciar.
  }
  await eliminarBd();
}
