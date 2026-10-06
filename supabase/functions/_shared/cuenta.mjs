// Borrar la cuenta (Ley 29733: derecho de cancelación).
//
// La sesión se verifica en Auth igual que en crear-preferencia: nunca se borra
// por un id que mande el navegador. El handler recibe adaptadores para poder
// probarlo sin red ni credenciales (test/cuenta.test.mjs).
export const CONFIRMACION_BORRADO = "BORRAR";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const reply = (status, body, headers = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export function createDeleteAccountHandler(deps) {
  // Bitácora sin datos personales ni secretos: solo en qué paso se cayó (S5).
  const log = (paso, estado) => deps.log?.({ funcion: "borrar-cuenta", paso, estado });
  return async (request) => {
    const origin = request.headers.get("origin");
    const cors = { "Access-Control-Allow-Origin": deps.config.appOrigin, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
    if (!deps.config.appOrigin || origin !== deps.config.appOrigin) return reply(403, { error: "Origen no permitido." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { error: "Usa POST." }, cors);
    if (!deps.config.enabled) return reply(503, { error: "Por ahora no se puede borrar la cuenta desde la app. Escríbenos y lo hacemos nosotros." }, cors);
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer \S+$/.test(authorization)) return reply(401, { error: "Vuelve a iniciar sesión." }, cors);
    let user;
    try { user = await deps.authenticate(authorization); } catch { user = null; }
    if (!user?.id || !UUID.test(user.id)) return reply(401, { error: "Vuelve a iniciar sesión." }, cors);
    let body;
    try { body = await request.json(); } catch { return reply(400, { error: "Pedido inválido." }, cors); }
    // Confirmación fuerte: borrar es definitivo y no hay papelera.
    if (body?.confirmacion !== CONFIRMACION_BORRADO) return reply(400, { error: `Escribe ${CONFIRMACION_BORRADO} para confirmar.` }, cors);
    try {
      // Primero los datos y después el usuario de Auth: si se cae en medio, el
      // reintento encuentra la bodega ya borrada (la RPC no falla) y termina.
      // Al revés quedarían datos sin dueño que nadie podría pedir borrar.
      await deps.deleteData(user.id);
    } catch {
      log("datos", "error");
      return reply(503, { error: "No pudimos borrar tu cuenta. No se borró nada; vuelve a intentar en unos minutos." }, cors);
    }
    try {
      await deps.deleteAuthUser(user.id);
    } catch {
      log("auth", "error");
      return reply(503, { error: "Tus datos ya se borraron, pero falta cerrar la cuenta. Vuelve a intentar en unos minutos." }, cors);
    }
    log("fin", "ok");
    return reply(200, { deleted: true }, cors);
  };
}

// Adaptador real: REST de Supabase con la clave service_role del entorno de
// la función. Nunca llega al navegador.
export function accountRuntime(env, fetchImpl = fetch) {
  const supabaseUrl = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const appUrl = (env.APP_URL ?? "").replace(/\/$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const config = {
    appOrigin: appUrl ? new URL(appUrl).origin : "",
    enabled: Boolean(supabaseUrl && appUrl && service && env.SUPABASE_ANON_KEY),
  };
  async function call(url, options, okStatuses = []) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(15000) });
    if (!response.ok && !okStatuses.includes(response.status)) throw new Error(`Servicio respondió HTTP ${response.status}`);
    return response;
  }
  const serverHeaders = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const deps = {
    config,
    log: (entry) => console.error(JSON.stringify(entry)),
    authenticate: async (authorization) => {
      try { return await (await call(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization } })).json(); }
      catch { return null; }
    },
    deleteData: async (userId) => {
      await call(`${supabaseUrl}/rest/v1/rpc/borrar_datos_bodega`, { method: "POST", headers: serverHeaders, body: JSON.stringify({ p_user_id: userId }) });
    },
    // 404: el usuario ya no existe (reintento tras un corte). Cuenta como hecho.
    deleteAuthUser: async (userId) => {
      await call(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE", headers: serverHeaders }, [404]);
    },
  };
  return { deleteAccount: createDeleteAccountHandler(deps) };
}
