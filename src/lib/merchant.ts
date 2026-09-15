// Carga de la bodega del usuario logueado.
//
// Antes esto se hacia con `.single()`, que exige EXACTAMENTE una fila y tira
// error con cero o con dos. Las dos situaciones pasan en la vida real:
//
//   - Cero: el registro creo el usuario en Auth pero el INSERT de la bodega no
//     llego (se cayo la señal a media cuadra). El usuario entra, no hay fila,
//     la app lo mandaba de vuelta a /login, ahi entraba bien, y volvia a
//     rebotar: quedaba encerrado en un bucle sin manera de salir.
//   - Dos: ya hay UNIQUE en merchants.user_id, pero las cuentas partidas antes
//     de ponerlo siguen existiendo.
//
// Ahora pedimos la mas antigua (la de verdad) y devolvemos null si no hay.
// Quien llama decide: null = todavia falta crear la bodega, no = expulsar.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Merchant } from "@/types/database";

const CLAVE_BODEGA = "mi-bodega-digital:bodega";

export async function loadMerchant(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ merchant: Merchant | null; error: string | null }> {
  const { data, error } = await supabase
    .from("merchants")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return { merchant: null, error: error.message };
  return { merchant: (data?.[0] as Merchant) ?? null, error: null };
}

/**
 * Sesion sin pedirle permiso a la red.
 *
 * `getUser()` sale a internet a preguntarle a Supabase quien eres. Sin señal
 * devuelve usuario nulo, y la app entendia "no ha iniciado sesion" y mandaba a
 * /login a alguien que llevaba meses logueado: en modo avion la bodeguera no
 * podia entrar a su propia caja. `getSession()` lee la sesion guardada en el
 * telefono, sin red. Si esta vencida, la primera consulta a Supabase falla y
 * ahi si la tratamos como sesion caida.
 */
export async function sesionLocal(
  supabase: SupabaseClient,
): Promise<User | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user ?? null;
  } catch {
    return null;
  }
}

/** Ultima bodega conocida, para poder abrir la app sin señal. */
export function leerBodegaGuardada(userId: string): Merchant | null {
  try {
    const crudo = localStorage.getItem(CLAVE_BODEGA);
    if (!crudo) return null;
    const bodega = JSON.parse(crudo) as Merchant;
    // Si el telefono cambio de dueño, no le mostramos el negocio del anterior.
    return bodega.user_id === userId ? bodega : null;
  } catch {
    return null;
  }
}

export function guardarBodega(bodega: Merchant): void {
  try {
    localStorage.setItem(CLAVE_BODEGA, JSON.stringify(bodega));
  } catch {
    // Modo incognito o almacenamiento lleno: se pierde el modo sin señal, no la app.
  }
}

export function olvidarBodega(): void {
  try {
    localStorage.removeItem(CLAVE_BODEGA);
  } catch {
    // Nada que hacer.
  }
}
