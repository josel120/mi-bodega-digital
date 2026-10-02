import { createCheckoutHandler, createWebhookHandler } from "./payments.mjs";

// Solo REST/WebCrypto, sin SDK nuevo ni secretos en el bundle del navegador.
export function paymentRuntime(env, fetchImpl = fetch) {
  const supabaseUrl = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const appUrl = (env.APP_URL ?? "").replace(/\/$/, "");
  const appOrigin = appUrl ? new URL(appUrl).origin : "";
  const config = {
    appUrl, appOrigin,
    enabled: env.PAYMENTS_ENABLED === "on" && Boolean(appUrl && supabaseUrl && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_ANON_KEY && env.MERCADOPAGO_ACCESS_TOKEN && env.MERCADOPAGO_WEBHOOK_SECRET && env.MERCADOPAGO_COLLECTOR_ID) && ["test", "live"].includes(env.PAYMENTS_MODE),
    live: env.PAYMENTS_MODE === "live",
    collectorId: env.MERCADOPAGO_COLLECTOR_ID,
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET,
  };
  async function api(url, options = {}) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Servicio respondió HTTP ${response.status}`);
    if (response.status === 204) return null;
    return response.json();
  }
  const db = (path, options = {}) => api(`${supabaseUrl}/rest/v1/${path}`, {
    ...options, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...options.headers },
  });
  const mp = (path, options = {}) => api(`https://api.mercadopago.com/${path}`, {
    ...options, headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  });
  const deps = {
    config,
    authenticate: async (authorization) => {
      try { return await api(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization } }); }
      catch { return null; }
    },
    reserve: (userId, planType, requestId) => db("rpc/reservar_membresia", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_plan: planType, p_id: requestId }) }),
    createPreference: (body) => mp("checkout/preferences", { method: "POST", body: JSON.stringify(body) }),
    savePreference: async (id, preferenceId, checkoutUrl) => {
      const rows = await db(`membership_orders?id=eq.${encodeURIComponent(id)}&status=eq.creating`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ preference_id: preferenceId, checkout_url: checkoutUrl, status: "pending" }) });
      if (rows.length !== 1) throw new Error("No se guardó la preferencia");
    },
    getPayment: (id) => mp(`v1/payments/${encodeURIComponent(id)}`),
    getOrder: async (id) => (await db(`membership_orders?id=eq.${encodeURIComponent(id)}&select=*`))[0] ?? null,
    applyPayment: ({ orderId, paymentId, state, approvedAt }) => db("rpc/aplicar_pago_membresia", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_payment_id: paymentId, p_state: state, p_approved_at: approvedAt }) }),
  };
  return { checkout: createCheckoutHandler(deps), webhook: createWebhookHandler(deps) };
}
