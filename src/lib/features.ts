// Interruptores de funciones que todavía no están listas para el usuario.

/**
 * Pantalla de planes y suscripción.
 *
 * Oculta durante el piloto gratuito: el cobro con Mercado Pago aún no existe
 * (la app se publica como sitio estático, así que no hay servidor donde crear
 * la preferencia de pago) y un botón de pago que no hace nada le cuesta
 * confianza a una bodega que recién te está probando.
 *
 * Para volver a mostrarla: poner `true` acá. Reaparece la pestaña "Plan" en la
 * barra inferior y la ruta /subscription deja de redirigir.
 */
export const MOSTRAR_PLANES: boolean = false;
