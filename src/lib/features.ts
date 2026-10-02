// Interruptores de funciones que todavía no están listas para el usuario.

/**
 * Pantalla de planes y suscripción.
 *
 * Oculta durante el piloto gratuito. El checkout prepago está preparado en
 * Edge Functions, pero antes de habilitarlo hay que verificar esquema,
 * privacidad, secretos y pagos sandbox: ver docs/pagos-autoservicio.md.
 *
 * Para volver a mostrarla: poner `true` acá. Reaparece la pestaña "Plan" en la
 * barra inferior y la ruta /subscription deja de redirigir.
 */
export const MOSTRAR_PLANES: boolean = false;
