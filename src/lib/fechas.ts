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

/** Mismo cálculo, partiendo del `created_at` que guarda Supabase (ISO en UTC). */
export function diaLocalDeISO(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return diaLocal(fecha);
}
