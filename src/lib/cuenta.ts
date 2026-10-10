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

// ---- Ajustes de la bodega (nombre y número de Yape) ----

export const NOMBRE_BODEGA_MAX = 60;

/**
 * Número de Yape/Plin: celular peruano de 9 dígitos que empieza con 9.
 * Acepta espacios, guiones y el prefijo 51 / +51 / 0051, que se quitan.
 * Vacío es válido (el número es opcional) y se guarda como null.
 */
export function normalizarYape(
  texto: string,
): { ok: true; valor: string | null } | { ok: false; error: string } {
  const sinAdornos = texto.trim().replace(/[\s\-().]/g, "");
  if (sinAdornos === "") return { ok: true, valor: null };
  let digitos = sinAdornos.replace(/^(\+|00)/, "");
  if (!/^\d+$/.test(digitos)) {
    return { ok: false, error: "El número de Yape solo puede tener dígitos." };
  }
  if (digitos.length === 11 && digitos.startsWith("51")) digitos = digitos.slice(2);
  if (!/^9\d{8}$/.test(digitos)) {
    return { ok: false, error: "El número de Yape debe ser un celular de 9 dígitos que empiece con 9." };
  }
  return { ok: true, valor: digitos };
}

/** Nombre de la bodega: obligatorio, sin espacios sobrantes y con tope de largo. */
export function validarNombreBodega(
  texto: string,
): { ok: true; valor: string } | { ok: false; error: string } {
  const valor = texto.trim().replace(/\s+/g, " ");
  if (valor === "") return { ok: false, error: "Escribe el nombre de tu bodega." };
  if (valor.length > NOMBRE_BODEGA_MAX) {
    return { ok: false, error: `El nombre puede tener hasta ${NOMBRE_BODEGA_MAX} letras.` };
  }
  return { ok: true, valor };
}

/** Mensaje para la pantalla a partir de la respuesta de la función. */
export function mensajeErrorBorrado(cuerpo: unknown): string {
  if (cuerpo && typeof cuerpo === "object" && "error" in cuerpo) {
    const error = (cuerpo as { error: unknown }).error;
    if (typeof error === "string" && error.length > 0 && error.length < 300) return error;
  }
  return "No pudimos borrar tu cuenta. Revisa tu señal y vuelve a intentar.";
}
