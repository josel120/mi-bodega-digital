// Plan Fundador: la pantalla solo informa. El cupo (30 bodegas), los 6 meses por bodega y el
// cierre del 31 de diciembre de 2026 los decide y protege la base (supabase/05-plan-fundador.sql);
// aquí se lee `estado_fundador()` sin fiarse de más.
export type RazonFundador = "ok" | "sold_out" | "closed" | "ended";
const RAZONES: readonly string[] = ["ok", "sold_out", "closed", "ended"];

export interface EstadoFundador {
  cap: number;
  taken: number;
  remaining: number;
  isFounder: boolean;
  canBuy: boolean;
  monthsTotal: number;
  monthsLeft: number;
  reason: RazonFundador;
}

const entero = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

// Respuesta rara o ausente (por ejemplo, 05 aún sin aplicar) = null: la pantalla no muestra el plan.
export function parseEstadoFundador(data: unknown): EstadoFundador | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const cap = entero(d.cap), taken = entero(d.taken), remaining = entero(d.remaining);
  const monthsTotal = entero(d.months_total), monthsLeft = entero(d.months_left);
  if (cap === null || taken === null || remaining === null || cap === 0) return null;
  if (monthsTotal === null || monthsLeft === null || monthsTotal === 0 || monthsLeft > monthsTotal) return null;
  if (typeof d.is_founder !== "boolean" || typeof d.can_buy !== "boolean") return null;
  if (typeof d.reason !== "string" || !RAZONES.includes(d.reason)) return null;
  // Coherencia: solo se puede comprar cuando la razón es «ok».
  if (d.can_buy !== (d.reason === "ok")) return null;
  return { cap, taken, remaining, isFounder: d.is_founder, canBuy: d.can_buy, monthsTotal, monthsLeft, reason: d.reason as RazonFundador };
}

export type CodigoFundador = "founder_sold_out" | "founder_closed" | "founder_ended";

// La Edge Function responde 409 con uno de estos códigos si el plan dejó de estar disponible
// mientras la persona decidía (último cupo, cierre de fecha o 6 meses ya usados).
export async function codigoFundador(error: unknown): Promise<CodigoFundador | null> {
  const contexto = error && typeof error === "object" && "context" in error ? (error as { context: unknown }).context : null;
  if (!contexto || typeof (contexto as Response).json !== "function") return null;
  try {
    const cuerpo: unknown = await (contexto as Response).clone().json();
    const code = cuerpo && typeof cuerpo === "object" ? (cuerpo as { code?: unknown }).code : null;
    return code === "founder_sold_out" || code === "founder_closed" || code === "founder_ended" ? code : null;
  } catch { return null; }
}
