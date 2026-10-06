// Traduce los errores de Supabase Auth a castellano llano.
//
// Supabase responde en inglés ("Invalid login credentials", "Email not
// confirmed"...). Una bodeguera que lee eso no sabe si se equivocó de clave,
// si le falta confirmar el correo o si la app está rota, y termina creando
// otra cuenta. Aquí decimos qué pasó y qué hacer.
//
// Es una función pura, sin imports, para poder probarla con node:test.

const MENSAJES = {
  credenciales:
    "El correo o la contraseña no coinciden. Revísalos e intenta de nuevo.",
  sinConfirmar:
    "Todavía no confirmas tu correo. Abre el correo que te mandamos (mira también en spam) y toca el enlace para activar tu cuenta.",
  yaRegistrado:
    "Ese correo ya tiene una cuenta. Entra por \"Iniciar Sesión\" o usa \"Olvidé mi contraseña\".",
  muchosIntentos:
    "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a probar.",
  claveDebil:
    "La contraseña es muy débil. Usa al menos 6 caracteres, mezclando letras y números.",
  correoInvalido: "Ese correo no parece válido. Revisa que esté bien escrito.",
  mismaClave: "La contraseña nueva tiene que ser distinta de la anterior.",
  sinSenal:
    "No pudimos conectarnos. Revisa tu señal o tu internet e intenta de nuevo.",
  generico:
    "No pudimos completar la operación. Intenta de nuevo en un momento.",
} as const;

// Los códigos que manda Supabase en `error.code` (más estables que el texto).
const POR_CODIGO: Record<string, string> = {
  invalid_credentials: MENSAJES.credenciales,
  email_not_confirmed: MENSAJES.sinConfirmar,
  provider_email_needs_verification: MENSAJES.sinConfirmar,
  user_already_exists: MENSAJES.yaRegistrado,
  email_exists: MENSAJES.yaRegistrado,
  identity_already_exists: MENSAJES.yaRegistrado,
  over_request_rate_limit: MENSAJES.muchosIntentos,
  over_email_send_rate_limit: MENSAJES.muchosIntentos,
  weak_password: MENSAJES.claveDebil,
  email_address_invalid: MENSAJES.correoInvalido,
  validation_failed: MENSAJES.correoInvalido,
  same_password: MENSAJES.mismaClave,
  request_timeout: MENSAJES.sinSenal,
};

// Respaldo por texto: versiones viejas del servidor o errores sin `code`.
const POR_TEXTO: Array<[RegExp, string]> = [
  [/invalid login credentials|invalid credentials/i, MENSAJES.credenciales],
  [/email not confirmed/i, MENSAJES.sinConfirmar],
  [/already (been )?registered|already exists/i, MENSAJES.yaRegistrado],
  [/rate limit|too many|only request this after/i, MENSAJES.muchosIntentos],
  [/password should be|weak password/i, MENSAJES.claveDebil],
  [/should be different/i, MENSAJES.mismaClave],
  [/invalid.*email|email.*invalid/i, MENSAJES.correoInvalido],
  [/failed to fetch|network|load failed|fetch failed/i, MENSAJES.sinSenal],
];

export function traducirErrorAuth(error: unknown): string {
  if (!error || typeof error !== "object") return MENSAJES.generico;

  const { code, status, message, name } = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
    name?: unknown;
  };

  if (typeof code === "string" && POR_CODIGO[code]) return POR_CODIGO[code];

  const texto = typeof message === "string" ? message : "";
  for (const [patron, mensaje] of POR_TEXTO) {
    if (patron.test(texto)) return mensaje;
  }

  // 429 = demasiadas peticiones, aunque el texto no lo diga.
  if (status === 429) return MENSAJES.muchosIntentos;

  // Sin señal el SDK lanza AuthRetryableFetchError (o un TypeError del fetch).
  if (name === "AuthRetryableFetchError" || name === "TypeError") {
    return MENSAJES.sinSenal;
  }

  // Nunca mostramos el inglés crudo: mejor un mensaje genérico entendible.
  return MENSAJES.generico;
}
