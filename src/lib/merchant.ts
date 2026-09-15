// Carga de la bodega del usuario logueado.
//
// Antes esto se hacia con `.single()`, que exige EXACTAMENTE una fila y tira
// error con cero o con dos. Las dos situaciones pasan en la vida real:
//
//   - Cero: el registro creo el usuario en Auth pero el INSERT de la bodega no
//     llego (se cayo la señal a media cuadra). El usuario entra, no hay fila,
//     la app lo mandaba de vuelta a /login, ahi entraba bien, y volvia a
//     rebotar: quedaba encerrado en un bucle sin manera de salir.
//   - Dos: no hay UNIQUE en merchants.user_id, asi que un segundo registro
//     deja dos bodegas y rompe al usuario de la misma forma.
//
// Ahora pedimos la mas antigua (la de verdad) y devolvemos null si no hay.
// Quien llama decide: null = todavia falta crear la bodega, no = expulsar.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Merchant } from "@/types/database";

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
