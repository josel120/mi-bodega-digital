// Días en hora del local, no en UTC.
//
// La caja se cierra a las 10 de la noche de Lima. Si el día lo calculáramos en
// UTC, esa venta caería en el día siguiente (Lima es UTC-5) y la bodeguera
// vería su última hora de trabajo en la pantalla de mañana.

/** "2026-09-16" del día en que vive el teléfono. */
export function diaLocal(d: Date = new Date()): string {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/**
 * ¿Ese día todavía no llegó? Los "AAAA-MM-DD" se comparan como texto.
 *
 * Las flechas no dejan pasar de hoy, pero el calendario nativo sí dejaba
 * elegir mañana o el mes que viene, y la venta quedaba anotada en un día que
 * no existe todavía: no salía en la caja de hoy y aparecía días después.
 */
export function esDiaFuturo(dia: string, hoy: string = diaLocal()): boolean {
  return dia > hoy;
}

/** Mismo cálculo, partiendo del `created_at` que guarda Supabase (ISO en UTC). */
export function diaLocalDeISO(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return diaLocal(fecha);
}
