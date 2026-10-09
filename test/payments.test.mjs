import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createCheckoutHandler, createWebhookHandler, verifySignature, validCheckoutUrl } from "../supabase/functions/_shared/payments.mjs";
import { paymentRuntime } from "../supabase/functions/_shared/runtime.mjs";
import { checkoutUrl } from "../src/lib/checkout.ts";

// Todos los adaptadores son falsos: ninguna petición sale a servicios reales.
globalThis.fetch = () => { throw new Error("Red no permitida en los tests"); };
const ID = "11111111-1111-4111-8111-111111111111";
const CHECKOUT = "https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=test";
const SANDBOX = "https://sandbox.mercadopago.com.pe/checkout/v1/redirect?pref_id=test";
const CONFIG = { enabled: true, live: true, appOrigin: "https://josel120.github.io", appUrl: "https://josel120.github.io/mi-bodega-digital", collectorId: "999", webhookSecret: "test-webhook-secret" };
function order(overrides = {}) { return { id: ID, merchant_id: "merchant", plan_type: "monthly", amount: 29, status: "creating", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), ...overrides }; }
function request(body = { planType: "monthly", requestId: ID }, headers = {}) {
  return new Request("https://project.supabase.co/functions/v1/crear-preferencia", { method: "POST", headers: { origin: CONFIG.appOrigin, authorization: "Bearer test-session", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
function signedRequest(id = "123", secret = CONFIG.webhookSecret, signatureOverride) {
  const ts = "1704908010", requestId = "test-request-123";
  const signature = signatureOverride ?? createHmac("sha256", secret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest("hex");
  return new Request(`https://project.supabase.co/functions/v1/webhook-mercadopago?data.id=${id}&type=payment`, { method: "POST", headers: { "x-request-id": requestId, "x-signature": `ts=${ts},v1=${signature}` }, body: JSON.stringify({ data: { id: "body-is-not-trusted" }, status: "approved" }) });
}
function checkoutDeps(overrides = {}) {
  return { config: CONFIG, authenticate: async () => ({ id: "verified-user" }), reserve: async () => ({ created: true, order: order() }), createPreference: async () => ({ id: "pref_test", init_point: CHECKOUT, sandbox_init_point: SANDBOX }), savePreference: async () => {}, ...overrides };
}
function payment(overrides = {}) { return { id: 123, external_reference: ID, status: "approved", currency_id: "PEN", transaction_amount: 29, transaction_amount_refunded: 0, live_mode: true, collector_id: 999, date_approved: "2026-10-02T00:00:00Z", ...overrides }; }
function webhookDeps(overrides = {}) { return { config: CONFIG, getPayment: async () => payment(), getOrder: async () => order(), applyPayment: async () => {}, ...overrides }; }

describe("checkout autenticado", () => {
  it("usa usuario verificado y precio de servidor aunque el cliente mande otros datos", async () => {
    let saved = false;
    const handler = createCheckoutHandler(checkoutDeps({
      reserve: async (userId, plan, requestId) => { assert.equal(userId, "verified-user"); assert.equal(plan, "yearly"); assert.equal(requestId, ID); return { created: true, order: order({ plan_type: "yearly", amount: 279 }) }; },
      createPreference: async (body) => {
        assert.equal(body.items[0].unit_price, 279); assert.equal(body.items[0].currency_id, "PEN");
        assert.equal(body.external_reference, ID); assert.ok(body.back_urls.success.includes("/mi-bodega-digital/subscription/"));
        assert.equal(body.expires, true); return { id: "pref_test", init_point: CHECKOUT };
      },
      savePreference: async (id, pref, url) => { assert.equal(id, ID); assert.equal(pref, "pref_test"); assert.equal(url, CHECKOUT); saved = true; },
    }));
    const response = await handler(request({ planType: "yearly", requestId: ID, merchantId: "victim", price: 1 }));
    assert.equal(response.status, 200); assert.equal(saved, true); assert.equal((await response.json()).init_point, CHECKOUT);
  });
  it("bloquea origen ajeno, sesión inválida, planes arbitrarios y flag apagado antes de crear checkout", async () => {
    const never = async () => { throw new Error("No debía crear preferencia"); };
    assert.equal((await createCheckoutHandler(checkoutDeps({ createPreference: never }))(request({}, { origin: "https://evil.test" }))).status, 403);
    assert.equal((await createCheckoutHandler(checkoutDeps({ authenticate: async () => null, createPreference: never }))(request())).status, 401);
    for (const planType of ["free", "__proto__", "toString", null]) assert.equal((await createCheckoutHandler(checkoutDeps({ createPreference: never }))(request({ planType, requestId: ID }))).status, 400);
    assert.equal((await createCheckoutHandler(checkoutDeps({ config: { ...CONFIG, enabled: false }, createPreference: never }))(request())).status, 503);
  });
  it("reutiliza pedido, bloquea creación incierta y no crea preferencia si ya está pagado", async () => {
    let creates = 0;
    const deps = checkoutDeps({ createPreference: async () => { creates++; return { id: "pref_test", init_point: CHECKOUT }; } });
    let handler = createCheckoutHandler({ ...deps, reserve: async () => ({ created: false, order: order({ status: "pending", checkout_url: CHECKOUT }) }) });
    assert.equal((await handler(request())).status, 200);
    handler = createCheckoutHandler({ ...deps, reserve: async () => ({ created: false, order: order() }) });
    assert.equal((await handler(request())).status, 409);
    handler = createCheckoutHandler({ ...deps, reserve: async () => ({ created: false, order: order({ status: "paid", checkout_url: CHECKOUT }) }) });
    assert.equal((await handler(request())).status, 409); assert.equal(creates, 0);
  });
  it("selecciona sandbox y muestra fallo si guardar la preferencia falla", async () => {
    const sandbox = createCheckoutHandler(checkoutDeps({ config: { ...CONFIG, live: false } }));
    assert.equal((await (await sandbox(request())).json()).init_point, SANDBOX);
    const failed = createCheckoutHandler(checkoutDeps({ savePreference: async () => { throw new Error("secret-do-not-expose"); } }));
    const response = await failed(request()); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("secret-do-not-expose"));
  });
});

describe("plan fundador", () => {
  it("cobra S/ 19 con precio de servidor aunque el cliente mande otro", async () => {
    let unit = null;
    const handler = createCheckoutHandler(checkoutDeps({
      reserve: async (_user, plan) => { assert.equal(plan, "founder"); return { created: true, order: order({ plan_type: "founder", amount: 19 }) }; },
      createPreference: async (body) => { unit = body.items[0]; return { id: "pref_test", init_point: CHECKOUT }; },
    }));
    const response = await handler(request({ planType: "founder", requestId: ID, price: 1, amount: 1 }));
    assert.equal(response.status, 200); assert.equal(unit.unit_price, 19); assert.equal(unit.currency_id, "PEN");
  });
  it("sin cupo responde 409 claro y no crea preferencia", async () => {
    const never = async () => { throw new Error("No debía crear preferencia"); };
    const handler = createCheckoutHandler(checkoutDeps({ reserve: async () => ({ created: false, sold_out: true }), createPreference: never }));
    const response = await handler(request({ planType: "founder", requestId: ID }));
    assert.equal(response.status, 409); assert.equal((await response.json()).code, "founder_sold_out");
  });
  it("cierre de cupos y 6 meses usados responden 409 con su código y no crean preferencia", async () => {
    const never = async () => { throw new Error("No debía crear preferencia"); };
    for (const [resultado, code] of [[{ founder_closed: true }, "founder_closed"], [{ founder_ended: true }, "founder_ended"]]) {
      const handler = createCheckoutHandler(checkoutDeps({ reserve: async () => ({ created: false, ...resultado }), createPreference: never }));
      const response = await handler(request({ planType: "founder", requestId: ID }));
      assert.equal(response.status, 409); assert.equal((await response.json()).code, code);
    }
  });
  it("el webhook solo concilia el pago fundador si pago y pedido son de S/ 19", async () => {
    const founder = (overrides) => order({ plan_type: "founder", amount: 19, ...overrides });
    const ok = [];
    let response = await createWebhookHandler(webhookDeps({ getOrder: async () => founder(), getPayment: async () => payment({ transaction_amount: 19 }), applyPayment: async (v) => { ok.push(v); } }))(signedRequest());
    assert.equal(response.status, 200); assert.equal(ok.length, 1);
    // Pagó 29 por un pedido fundador, o el pedido guarda otro monto: se rechaza sin acreditar.
    for (const [getOrder, getPayment] of [[() => founder(), () => payment({ transaction_amount: 29 })], [() => founder({ amount: 29 }), () => payment({ transaction_amount: 19 })], [() => order({ amount: 29 }), () => payment({ transaction_amount: 19 })]]) {
      let writes = 0;
      response = await createWebhookHandler(webhookDeps({ getOrder: async () => getOrder(), getPayment: async () => getPayment(), applyPayment: async () => { writes++; } }))(signedRequest());
      assert.equal(response.status, 422); assert.equal(writes, 0);
    }
  });
});

describe("webhook verificado", () => {
  it("firma oficial: recurso query en minúsculas, firma alterada rechazada", async () => {
    assert.equal(await verifySignature(signedRequest("ABC-123"), CONFIG.webhookSecret), true);
    assert.equal(await verifySignature(signedRequest("123", "wrong-secret"), CONFIG.webhookSecret), false);
    assert.equal(await verifySignature(signedRequest("123", CONFIG.webhookSecret, "0".repeat(64)), CONFIG.webhookSecret), false);
    assert.equal(await verifySignature(signedRequest(), ""), false);
  });
  it("no consulta ni activa si la firma es falsa", async () => {
    const never = async () => { throw new Error("No debía acceder a datos"); };
    const response = await createWebhookHandler(webhookDeps({ getPayment: never, applyPayment: never }))(signedRequest("123", "wrong-secret"));
    assert.equal(response.status, 401);
  });
  it("reconsulta pago; id, importe, moneda, modo, vendedor y fecha deben coincidir", async () => {
    for (const bad of [{ id: 456 }, { transaction_amount: 1 }, { currency_id: "USD" }, { live_mode: false }, { collector_id: 123 }, { date_approved: null }]) {
      let writes = 0;
      const response = await createWebhookHandler(webhookDeps({ getPayment: async () => payment(bad), applyPayment: async () => { writes++; } }))(signedRequest());
      assert.ok([200, 422].includes(response.status)); assert.equal(writes, 0);
    }
  });
  it("aprobado y devolución parcial/full se envían a conciliación; pendiente no activa", async () => {
    for (const [overrides, expected] of [[{}, "approved"], [{ status: "refunded" }, "refunded"], [{ transaction_amount_refunded: 10 }, "refunded"], [{ status: "charged_back" }, "charged_back"], [{ status: "pending" }, null]]) {
      const writes = [];
      const response = await createWebhookHandler(webhookDeps({ getPayment: async () => payment(overrides), applyPayment: async (value) => { writes.push(value); } }))(signedRequest());
      assert.equal(response.status, 200); assert.equal(writes.length, expected ? 1 : 0);
      if (expected) assert.equal(writes[0].state, expected);
    }
  });
  it("si la base falla, devuelve error para permitir reintento del proveedor", async () => {
    const response = await createWebhookHandler(webhookDeps({ applyPayment: async () => { throw new Error("database-offline"); } }))(signedRequest());
    assert.equal(response.status, 503);
  });
});

it("frontend y Edge rechazan redirects ajenos o credenciales en URL", () => {
  for (const url of [CHECKOUT, SANDBOX]) { assert.equal(validCheckoutUrl(url), true); assert.ok(checkoutUrl({ init_point: url })); }
  for (const url of ["javascript:alert(1)", "https://www.mercadopago.com.pe.evil.test/checkout/x", "https://user:pass@www.mercadopago.com.pe/checkout/x", "https://www.mercadopago.com.pe/not-checkout", "https://www.mercadopago.com.pe:444/checkout/x"]) {
    assert.equal(validCheckoutUrl(url), false); assert.equal(checkoutUrl({ init_point: url }), null);
  }
});

it("adaptador REST autentica sesión y usa secretos solo en servicios del servidor", async () => {
  const seen = [];
  const fakeFetch = async (url, options) => {
    seen.push([url, options]);
    if (url.endsWith("/auth/v1/user")) { assert.equal(options.headers.Authorization, "Bearer test-session"); return Response.json({ id: "verified-user" }); }
    if (url.endsWith("/rpc/reservar_membresia")) { assert.equal(JSON.parse(options.body).p_user_id, "verified-user"); return Response.json({ created: true, order: order() }); }
    if (url.endsWith("/checkout/preferences")) { assert.equal(options.headers.Authorization, "Bearer server-mp-key"); return Response.json({ id: "pref_test", init_point: CHECKOUT }); }
    if (url.includes("membership_orders?")) { assert.equal(options.headers.apikey, "server-service-key"); return Response.json([order({ status: "pending" })]); }
    throw new Error(`URL inesperada: ${url}`);
  };
  const runtime = paymentRuntime({ SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "public-key", SUPABASE_SERVICE_ROLE_KEY: "server-service-key", MERCADOPAGO_ACCESS_TOKEN: "server-mp-key", MERCADOPAGO_WEBHOOK_SECRET: CONFIG.webhookSecret, MERCADOPAGO_COLLECTOR_ID: "999", APP_URL: CONFIG.appUrl, PAYMENTS_ENABLED: "on", PAYMENTS_MODE: "live" }, fakeFetch);
  const response = await runtime.checkout(request()); assert.equal(response.status, 200);
  assert.equal(seen.length, 4); assert.ok(!(await response.text()).includes("server-service-key"));
});
