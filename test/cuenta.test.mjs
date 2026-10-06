import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDeleteAccountHandler, accountRuntime, CONFIRMACION_BORRADO } from "../supabase/functions/_shared/cuenta.mjs";

// Todos los adaptadores son falsos: ninguna petición sale a servicios reales.
globalThis.fetch = () => { throw new Error("Red no permitida en los tests"); };
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APP = "https://josel120.github.io";
const CONFIG = { enabled: true, appOrigin: APP };
function request(body = { confirmacion: CONFIRMACION_BORRADO }, headers = {}, method = "POST") {
  return new Request("https://project.supabase.co/functions/v1/borrar-cuenta", { method, headers: { origin: APP, authorization: "Bearer test-session", "content-type": "application/json", ...headers }, body: method === "POST" ? JSON.stringify(body) : undefined });
}
function deps(overrides = {}) {
  const calls = [];
  return {
    calls,
    config: CONFIG,
    log: (entry) => calls.push(["log", entry]),
    authenticate: async () => ({ id: USER }),
    deleteData: async (id) => { calls.push(["data", id]); },
    deleteAuthUser: async (id) => { calls.push(["auth", id]); },
    ...overrides,
  };
}

describe("borrar-cuenta", () => {
  it("borra datos y después el usuario verificado, ignorando ids del cliente", async () => {
    const d = deps();
    const response = await createDeleteAccountHandler(d)(request({ confirmacion: "BORRAR", userId: "victima", merchantId: "otra" }));
    assert.equal(response.status, 200);
    assert.deepEqual(d.calls.filter(([k]) => k !== "log"), [["data", USER], ["auth", USER]]);
    assert.equal(response.headers.get("access-control-allow-origin"), APP);
  });

  it("sin confirmación exacta, sesión válida u origen propio no borra nada", async () => {
    const never = async () => { throw new Error("No debía borrar"); };
    const base = { deleteData: never, deleteAuthUser: never };
    for (const body of [{}, { confirmacion: "borrar" }, { confirmacion: " BORRAR" }, { confirmacion: true }, null]) {
      assert.equal((await createDeleteAccountHandler(deps(base))(request(body))).status, 400);
    }
    assert.equal((await createDeleteAccountHandler(deps(base))(request(undefined, { origin: "https://evil.test" }))).status, 403);
    assert.equal((await createDeleteAccountHandler(deps({ ...base, config: { ...CONFIG, appOrigin: "" } }))(request(undefined, { origin: "" }))).status, 403);
    assert.equal((await createDeleteAccountHandler(deps(base))(request(undefined, { authorization: "" }))).status, 401);
    assert.equal((await createDeleteAccountHandler(deps({ ...base, authenticate: async () => null }))(request())).status, 401);
    assert.equal((await createDeleteAccountHandler(deps({ ...base, authenticate: async () => { throw new Error("caído"); } }))(request())).status, 401);
    assert.equal((await createDeleteAccountHandler(deps({ ...base, authenticate: async () => ({ id: "../admin" }) }))(request())).status, 401);
    assert.equal((await createDeleteAccountHandler(deps({ ...base, config: { ...CONFIG, enabled: false } }))(request())).status, 503);
    assert.equal((await createDeleteAccountHandler(deps(base))(request(undefined, {}, "GET"))).status, 405);
    assert.equal((await createDeleteAccountHandler(deps(base))(request(undefined, {}, "OPTIONS"))).status, 204);
  });

  it("si falla la base no toca Auth; si falla Auth avisa que los datos ya se borraron", async () => {
    let d = deps({ deleteData: async () => { throw new Error("db-secret-detail"); } });
    let response = await createDeleteAccountHandler(d)(request());
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.ok(!text.includes("db-secret-detail"));
    assert.ok(text.includes("No se borró nada"));
    assert.equal(d.calls.some(([k]) => k === "auth"), false);
    d = deps({ deleteAuthUser: async () => { throw new Error("auth"); } });
    response = await createDeleteAccountHandler(d)(request());
    assert.equal(response.status, 503);
    assert.ok((await response.text()).includes("ya se borraron"));
    // La bitácora no lleva el id del usuario ni el correo.
    assert.ok(d.calls.filter(([k]) => k === "log").every(([, entry]) => !JSON.stringify(entry).includes(USER)));
  });
});

describe("adaptador REST de borrar-cuenta", () => {
  const ENV = { SUPABASE_URL: "https://project.supabase.co/", SUPABASE_ANON_KEY: "public-key", SUPABASE_SERVICE_ROLE_KEY: "server-service-key", APP_URL: "https://josel120.github.io/mi-bodega-digital/" };

  it("verifica sesión con la clave pública y borra con service_role solo en el servidor", async () => {
    const seen = [];
    const fakeFetch = async (url, options) => {
      seen.push([url, options.method ?? "GET"]);
      if (url === "https://project.supabase.co/auth/v1/user") {
        assert.equal(options.headers.apikey, "public-key");
        assert.equal(options.headers.Authorization, "Bearer test-session");
        return Response.json({ id: USER });
      }
      if (url === "https://project.supabase.co/rest/v1/rpc/borrar_datos_bodega") {
        assert.equal(options.headers.apikey, "server-service-key");
        assert.deepEqual(JSON.parse(options.body), { p_user_id: USER });
        return Response.json({ merchants: 1, orders_detached: 0 });
      }
      if (url === `https://project.supabase.co/auth/v1/admin/users/${USER}`) {
        assert.equal(options.method, "DELETE");
        assert.equal(options.headers.Authorization, "Bearer server-service-key");
        return new Response(null, { status: 200 });
      }
      throw new Error(`URL inesperada: ${url}`);
    };
    const originalError = console.error; console.error = () => {};
    try {
      const response = await accountRuntime(ENV, fakeFetch).deleteAccount(request());
      assert.equal(response.status, 200);
      assert.ok(!(await response.text()).includes("server-service-key"));
    } finally { console.error = originalError; }
    assert.deepEqual(seen.map(([, m]) => m), ["GET", "POST", "DELETE"]);
  });

  it("usuario de Auth ya borrado (404) cuenta como hecho; un 500 no", async () => {
    const make = (status) => async (url) => {
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: USER });
      if (url.endsWith("/rpc/borrar_datos_bodega")) return Response.json({ merchants: 0 });
      return new Response(null, { status });
    };
    const originalError = console.error; console.error = () => {};
    try {
      assert.equal((await accountRuntime(ENV, make(404)).deleteAccount(request())).status, 200);
      assert.equal((await accountRuntime(ENV, make(500)).deleteAccount(request())).status, 503);
    } finally { console.error = originalError; }
  });

  it("sin claves del servidor queda apagada", async () => {
    const response = await accountRuntime({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: "" }, async () => { throw new Error("no"); }).deleteAccount(request());
    assert.equal(response.status, 503);
  });
});
