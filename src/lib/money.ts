// Lectura de montos tecleados a mano.
//
// En Perú se escribe "12,50" tan seguido como "12.50". Con <input type="number">
// el navegador descarta el valor con coma y deja el campo vacio: el bodeguero
// ve el monto escrito en pantalla pero la app recibe "". Por eso los campos de
// plata son type="text" con inputMode="decimal" (teclado numerico en el celular)
// y la coma la normalizamos aca.
export function parseMoney(raw: string): number | null {
  const clean = raw.replace(/\s/g, "").replace(",", ".");
  if (clean === "") return null;
  const value = Number(clean);
  if (!Number.isFinite(value)) return null;
  // Redondeamos a centimos: 0.1 + 0.2 no puede convertirse en 0.30000000000000004
  // dentro de la caja del dia.
  return Math.round(value * 100) / 100;
}

/** Monto valido para registrar una venta, un gasto o un movimiento de fiado. */
export function parseAmount(raw: string): number | null {
  const value = parseMoney(raw);
  if (value === null || value <= 0) return null;
  return value;
}
