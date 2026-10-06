// Lectura de montos tecleados a mano.
//
// En Perú se escribe "12,50" tan seguido como "12.50". Con <input type="number">
// el navegador descarta el valor con coma y deja el campo vacio: el bodeguero
// ve el monto escrito en pantalla pero la app recibe "". Por eso los campos de
// plata son type="text" con inputMode="decimal" (teclado numerico en el celular)
// y la coma la normalizamos aca.

// Solo cifras con, a lo sumo, un separador decimal y dos decimales. `Number()`
// a secas aceptaba "0x10" (16) o "1e3" (1000): un monto pegado desde otro lado
// se convertía en otra cifra sin que nadie lo notara. Y "1,005" puede ser mil
// cinco o un sol con medio céntimo: antes se guardaba S/ 1.00 en silencio;
// ahora se rechaza y la pantalla pide escribirlo de nuevo.
const MONTO = /^-?(\d+([.,]\d{0,2})?|[.,]\d{1,2})$/;

export function parseMoney(raw: string): number | null {
  const clean = raw.replace(/\s/g, "");
  if (clean === "") return null;
  if (!MONTO.test(clean)) return null;
  const normalizado = clean.replace(",", ".");
  if (!Number.isFinite(Number(normalizado))) return null;
  // Pasamos a centimos corriendo la coma en el texto ("12.35e2" = 1235) y no
  // multiplicando, que arrastra error de coma flotante: 0.1 + 0.2 no puede
  // convertirse en 0.30000000000000004 dentro de la caja del dia.
  const centimos = Math.round(Number(`${normalizado}e2`));
  // `|| 0` convierte el -0 de "-0" en 0.
  return centimos / 100 || 0;
}

/** Monto valido para registrar una venta, un gasto o un movimiento de fiado. */
export function parseAmount(raw: string): number | null {
  const value = parseMoney(raw);
  if (value === null || value <= 0) return null;
  return value;
}

/**
 * Deuda inicial de un cliente nuevo: el campo es opcional.
 *
 * Vacío = no debe nada. Pero algo escrito que no se entiende NO es cero: antes
 * "12a" o "1.250,50" creaban al cliente debiendo S/ 0.00 sin avisar, y la
 * deuda real quedaba solo en la cabeza de la bodeguera.
 */
export function parseSaldoInicial(
  raw: string,
): { ok: true; saldo: number } | { ok: false; motivo: string } {
  if (raw.trim() === "") return { ok: true, saldo: 0 };
  const saldo = parseMoney(raw);
  if (saldo === null) {
    return {
      ok: false,
      motivo:
        "No entendimos la deuda inicial. Escríbela así: 12.50 (o déjala vacía si no debe nada).",
    };
  }
  if (saldo < 0) {
    return { ok: false, motivo: "La deuda inicial no puede ser negativa." };
  }
  return { ok: true, saldo };
}
