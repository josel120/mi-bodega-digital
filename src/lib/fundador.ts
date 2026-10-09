// Plan Fundador: la pantalla solo informa. El cupo (30 bodegas) lo decide y lo protege la
// base (supabase/05-plan-fundador.sql); aquí se lee `estado_fundador()` sin fiarse de más.
export interface EstadoFundador {
  cap: number;
  taken: number;
  remaining: number;
  isFounder: boolean;
  canBuy: boolean;
}

const entero = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

// Respuesta rara o ausente (por ejemplo, 05 aún sin aplicar) = null: la pantalla no muestra el plan.
export function parseEstadoFundador(data: unknown): EstadoFundador | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const cap = entero(d.cap), taken = entero(d.taken), remaining = entero(d.remaining);
  if (cap === null || taken === null || remaining === null || cap === 0) return null;
  if (typeof d.is_founder !== "boolean" || typeof d.can_buy !== "boolean") return null;
  return { cap, taken, remaining, isFounder: d.is_founder, canBuy: d.can_buy };
}

// La Edge Function responde 409 {code:"founder_sold_out"} si el último cupo se fue mientras tanto.
export async function esFundadorAgotado(error: unknown): Promise<boolean> {
  const contexto = error && typeof error === "object" && "context" in error ? (error as { context: unknown }).context : null;
  if (!contexto || typeof (contexto as Response).json !== "function") return false;
  try {
    const cuerpo: unknown = await (contexto as Response).clone().json();
    return Boolean(cuerpo && typeof cuerpo === "object" && (cuerpo as { code?: unknown }).code === "founder_sold_out");
  } catch { return false; }
}
