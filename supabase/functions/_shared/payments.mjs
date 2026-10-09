// Checkout prepago: la pantalla nunca decide precio, dueño ni estado del pago.
// Los handlers reciben adaptadores para poder probarlos sin red ni credenciales.
export const PLANS = Object.freeze({
  monthly: Object.freeze({ amount: 29, title: "Mi Bodega Digital · 1 mes" }),
  yearly: Object.freeze({ amount: 279, title: "Mi Bodega Digital · 12 meses" }),
  // Fundador: S/ 19, 1 mes prepagado, tope de 30 bodegas. El tope y la retención del cupo
  // viven en la base (supabase/05-plan-fundador.sql); aquí solo el precio que se cobra.
  founder: Object.freeze({ amount: 19, title: "Mi Bodega Digital · 1 mes (Fundador)" }),
});
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const reply = (status, body, headers = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export function validCheckoutUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && ["www.mercadopago.com.pe", "sandbox.mercadopago.com.pe"].includes(url.hostname) && url.pathname.startsWith("/checkout/");
  } catch { return false; }
}

export async function verifySignature(request, secret) {
  const resourceId = new URL(request.url).searchParams.get("data.id");
  const requestId = request.headers.get("x-request-id");
  const parts = (request.headers.get("x-signature") ?? "").split(",").map((part) => part.trim().split("="));
  if (!secret || !resourceId || !/^[a-z0-9-]+$/i.test(resourceId) || !requestId || !/^[a-z0-9-]+$/i.test(requestId)) return false;
  if (parts.filter(([key]) => key === "ts").length !== 1 || parts.filter(([key]) => key === "v1").length !== 1) return false;
  const ts = parts.find(([key]) => key === "ts")?.[1];
  const signature = parts.find(([key]) => key === "v1")?.[1];
  if (!/^\d+$/.test(ts ?? "") || !/^[a-f0-9]{64}$/i.test(signature ?? "")) return false;
  // La firma autentica el recurso; se consulta su estado actual al proveedor.
  // Replays son seguros por aplicación atómica, sin depender de edad del mensaje.
  const manifest = `id:${resourceId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from(signature.match(/../g), (pair) => parseInt(pair, 16));
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(manifest));
}

export function createCheckoutHandler(deps) {
  return async (request) => {
    const origin = request.headers.get("origin");
    const cors = { "Access-Control-Allow-Origin": deps.config.appOrigin, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
    if (origin !== deps.config.appOrigin) return reply(403, { error: "Origen no permitido." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { error: "Usa POST." }, cors);
    if (!deps.config.enabled) return reply(503, { error: "Los pagos todavía no están disponibles." }, cors);
    try {
      const authorization = request.headers.get("authorization") ?? "";
      if (!/^Bearer \S+$/.test(authorization)) return reply(401, { error: "Vuelve a iniciar sesión." }, cors);
      const user = await deps.authenticate(authorization);
      if (!user?.id) return reply(401, { error: "Vuelve a iniciar sesión." }, cors);
      let body;
      try { body = await request.json(); } catch { return reply(400, { error: "Pedido inválido." }, cors); }
      if (!body || !Object.hasOwn(PLANS, body.planType) || !UUID.test(body.requestId ?? "")) return reply(400, { error: "Plan o pedido inválido." }, cors);
      const reservation = await deps.reserve(user.id, body.planType, body.requestId);
      // Sin cupo fundador la base no crea pedido: se avisa claro, sin crear checkout.
      if (reservation.sold_out) return reply(409, { error: "Ya no quedan cupos del Plan Fundador.", code: "founder_sold_out" }, cors);
      if (reservation.founder_closed) return reply(409, { error: "El Plan Fundador cerró sus cupos nuevos el 31 de diciembre de 2026.", code: "founder_closed" }, cors);
      if (reservation.founder_ended) return reply(409, { error: "Ya usaste los 6 meses del Plan Fundador. Elige el Plan Mensual o el Anual.", code: "founder_ended" }, cors);
      const order = reservation.order;
      if (!order || order.plan_type !== body.planType) return reply(409, { error: "No pudimos preparar este pedido." }, cors);
      if (order.status === "paid") return reply(409, { error: "Este pedido ya está pagado. Revisa tu plan." }, cors);
      if (order.checkout_url && validCheckoutUrl(order.checkout_url) && new Date(order.expires_at).getTime() > Date.now()) return reply(200, { init_point: order.checkout_url }, cors);
      // Si se perdió la respuesta después de crear la preferencia, no crear
      // otra a ciegas: podría producir dos cobros para el mismo pedido.
      if (!reservation.created) return reply(409, { error: "El pedido está en revisión. No vuelvas a pagar; revisa tu plan más tarde." }, cors);
      const plan = PLANS[body.planType];
      const preference = await deps.createPreference({
        items: [{ id: body.planType, title: plan.title, quantity: 1, unit_price: plan.amount, currency_id: "PEN" }],
        external_reference: order.id,
        back_urls: Object.fromEntries(["success", "pending", "failure"].map((state) => [state, `${deps.config.appUrl}/subscription/?payment=${state}`])),
        auto_return: "approved", expires: true,
        expiration_date_from: order.created_at,
        expiration_date_to: order.expires_at,
      });
      const checkoutUrl = deps.config.live ? preference.init_point : preference.sandbox_init_point;
      if (!preference.id || !validCheckoutUrl(checkoutUrl)) throw new Error("Preferencia inválida");
      await deps.savePreference(order.id, preference.id, checkoutUrl);
      return reply(200, { init_point: checkoutUrl }, cors);
    } catch {
      // No devolver textos del proveedor: pueden incluir emails o secretos.
      return reply(503, { error: "No pudimos preparar el pago. No vuelvas a pagar si ya lo hiciste; revisa tu plan más tarde." }, cors);
    }
  };
}

export function createWebhookHandler(deps) {
  return async (request) => {
    if (request.method !== "POST") return reply(405, { error: "Usa POST." });
    if (!deps.config.enabled) return reply(503, { error: "Pagos desactivados." });
    if (!await verifySignature(request, deps.config.webhookSecret)) return reply(401, { error: "Firma inválida." });
    const url = new URL(request.url);
    const id = url.searchParams.get("data.id");
    if (url.searchParams.get("type") !== "payment" || !/^\d+$/.test(id ?? "")) return reply(400, { error: "Evento no admitido." });
    try {
      // El body y la redirección del checkout nunca acreditan un pago.
      const payment = await deps.getPayment(id);
      if (String(payment.id) !== id || !UUID.test(payment.external_reference ?? "")) return reply(200, { ignored: true });
      const order = await deps.getOrder(payment.external_reference);
      if (!order) return reply(200, { ignored: true });
      const plan = PLANS[order.plan_type];
      if (!plan || payment.currency_id !== "PEN" || payment.transaction_amount !== plan.amount || order.amount !== plan.amount || payment.live_mode !== deps.config.live || String(payment.collector_id) !== deps.config.collectorId) return reply(422, { error: "El pago no coincide con el pedido." });
      const refunded = Number(payment.transaction_amount_refunded ?? 0);
      if (!Number.isFinite(refunded) || refunded < 0) return reply(422, { error: "Reembolso inválido." });
      let state = payment.status;
      // Solo una devolución total revoca el plan; una parcial lo mantiene
      // pagado (política: meses no iniciados se devuelven proporcionalmente).
      if (state === "approved" && refunded >= payment.transaction_amount) state = "refunded";
      else if (state === "approved" && refunded > 0) console.warn(`Devolución parcial del pago ${id}: el pedido se mantiene pagado; revisar a mano.`);
      if (!["approved", "refunded", "charged_back"].includes(state)) return reply(200, { ignored: true });
      if (state === "approved" && !Number.isFinite(Date.parse(payment.date_approved ?? ""))) return reply(422, { error: "Falta fecha del pago." });
      await deps.applyPayment({ orderId: order.id, paymentId: id, state, approvedAt: payment.date_approved ?? null });
      return reply(200, { received: true });
    } catch { return reply(503, { error: "No se pudo conciliar. Reintenta la notificación." }); }
  };
}
