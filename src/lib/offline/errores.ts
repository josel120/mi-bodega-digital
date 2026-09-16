// Distinguir "no hay señal" de "el servidor dijo que no".
//
// Es la decisión más delicada de la sincronización. Si confundimos un rechazo
// del servidor con falta de señal, la cola reintenta para siempre y la venta
// nunca sube sin que nadie se entere. Si confundimos falta de señal con un
// rechazo, marcamos como trabado algo que solo necesitaba esperar.

/** Lo que devuelve supabase-js en `error`: a veces PostgrestError, a veces la falla de fetch envuelta. */
export interface ErrorSupabase {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

const SENALES_DE_RED = [
  "failed to fetch", // Chrome
  "networkerror", // Firefox
  "load failed", // Safari / iOS
  "network request failed",
  "err_internet_disconnected",
  "the internet connection appears to be offline",
  "fetch failed",
  "timeout",
  "aborted",
];

/**
 * Sin señal (o el servidor no contestó). Se reintenta indefinidamente.
 *
 * Cómo se ve esto de verdad: cuando `fetch` revienta, postgrest-js arma
 * `{ message: "TypeError: Failed to fetch", details: <el stack>, code: "" }`.
 * O sea que `details` NO viene vacío, y el mensaje cambia según el navegador
 * ("Failed to fetch" en Chrome, "Load failed" en Safari, "NetworkError…" en
 * Firefox). Lo único constante es que **el código llega vacío**: cualquier
 * respuesta que de verdad pasó por Postgres trae código (23505, 42501,
 * PGRST202…). Por eso el código vacío manda.
 *
 * Equivocarse acá se paga caro en las dos direcciones: tomar un rechazo del
 * servidor por falta de señal deja la venta reintentando para siempre en
 * silencio; tomar la falta de señal por un rechazo traba algo que solo tenía
 * que esperar.
 */
export function esErrorDeRed(error: ErrorSupabase | null | undefined): boolean {
  if (!error) return false;

  const texto = (error.message ?? "").toLowerCase();
  if (SENALES_DE_RED.some((s) => texto.includes(s))) return true;

  // Nunca llegó a Postgres: no hay código que contar.
  if (!error.code) return true;

  // 5xx de PostgREST o del balanceador: el servidor está caído, no nos rechazó.
  if (/^(50\d|PGRST000)$/.test(error.code)) return true;

  return false;
}

/** La fila ya estaba arriba: el reintento chocó con la llave primaria. */
export function esDuplicado(error: ErrorSupabase | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return (error.message ?? "").toLowerCase().includes("duplicate key");
}

/** La sesión se venció mientras estábamos sin señal: hay que volver a entrar. */
export function esSesionVencida(
  error: ErrorSupabase | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "PGRST301" || error.code === "401") return true;
  const texto = (error.message ?? "").toLowerCase();
  return texto.includes("jwt expired") || texto.includes("invalid claim");
}

/** Todavía no corrieron `supabase/01-endurecer-esquema.sql`: no existe el RPC. */
export function faltaLaFuncion(
  error: ErrorSupabase | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const texto = (error.message ?? "").toLowerCase();
  return (
    texto.includes("schema cache") ||
    (texto.includes("function") && texto.includes("does not exist"))
  );
}

/** El saldo del fiado se iría por debajo de cero. */
export function esSaldoNegativo(
  error: ErrorSupabase | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "23514") return true;
  const texto = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return texto.includes("saldo_no_negativo") || texto.includes("saldo_negativo");
}
