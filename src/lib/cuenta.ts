// Borrar la cuenta desde la app. La decisión real la toma la Edge Function
// `borrar-cuenta` (supabase/functions/_shared/cuenta.mjs); acá solo está lo que
// la pantalla necesita para no mandar el pedido por un toque accidental.

/** Lo que hay que escribir para confirmar. Igual que en la Edge Function. */
export const CONFIRMACION_BORRADO = "BORRAR";

/**
 * ¿Escribió BORRAR? Se aceptan minúsculas y espacios alrededor porque el
 * teclado del celular pone mayúscula inicial o un espacio al final; lo que
 * importa es que lo haya escrito a propósito, no cómo.
 */
export function confirmacionValida(texto: string): boolean {
  return texto.trim().toUpperCase() === CONFIRMACION_BORRADO;
}

/** Mensaje para la pantalla a partir de la respuesta de la función. */
export function mensajeErrorBorrado(cuerpo: unknown): string {
  if (cuerpo && typeof cuerpo === "object" && "error" in cuerpo) {
    const error = (cuerpo as { error: unknown }).error;
    if (typeof error === "string" && error.length > 0 && error.length < 300) return error;
  }
  return "No pudimos borrar tu cuenta. Revisa tu señal y vuelve a intentar.";
}
