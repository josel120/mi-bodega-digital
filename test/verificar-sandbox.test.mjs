import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sumarMeses, cadenaEsperada, verificarCaso, motivoParaNegarse, leerArgumentos, cargar } from "../scripts/verificar-sandbox.mjs";

globalThis.fetch = () => { throw new Error("Red no permitida en los tests"); };
const AHORA = new Date("2026-10-06T12:00:00Z");
const ID = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const pedido = (n, extra) => ({ id: ID(n), merchant_id: ID(9), plan_type: "monthly", amount: 29, status: "paid", payment_id: String(100 + n), approved_at: "2026-10-01T00:00:00Z", granted_until: null, ...extra });

describe("cadena de vigencia (igual que recalcular_vigencia)", () => {
  it("suma meses como Postgres: fin de mes y bisiesto", () => {
    // Comparado contra Postgres en PGlite: timestamptz + interval en UTC.
    assert.equal(sumarMeses("2026-01-31T10:00:00Z", 1).toISOString(), "2026-02-28T10:00:00.000Z");
    assert.equal(sumarMeses("2028-02-29T00:00:00Z", 12).toISOString(), "2029-02-28T00:00:00.000Z");
  });
  it("apila por fecha de aprobación y saca los devueltos", () => {
    const a = pedido(1, { approved_at: "2026-10-01T00:00:00Z" });
    const b = pedido(2, { approved_at: "2026-10-02T00:00:00Z", plan_type: "yearly", amount: 279 });
    let c = cadenaEsperada([b, a], AHORA);
    assert.equal(c.hasta.get(a.id).toISOString(), "2026-11-01T00:00:00.000Z");
    assert.equal(c.finBodega.toISOString(), "2027-11-01T00:00:00.000Z");
    assert.equal(c.estadoBodega, "active_yearly");
    c = cadenaEsperada([{ ...a, status: "refunded" }, b], AHORA);
    assert.equal(c.finBodega.toISOString(), "2027-10-02T00:00:00.000Z");
    assert.equal(cadenaEsperada([{ ...a, approved_at: "2020-01-01T00:00:00Z" }], AHORA).estadoBodega, "inactive");
  });
});

describe("chequeos por caso", () => {
  const bodegaOk = (pedidos) => {
    const c = cadenaEsperada(pedidos, AHORA);
    return { id: ID(9), subscription_status: c.estadoBodega, subscription_ends_at: c.finBodega?.toISOString() ?? null };
  };
  it("aprobado correcto pasa; con un mes de más falla", () => {
    const p = pedido(1, { granted_until: "2026-11-01T00:00:00.000123Z" });
    const ok = verificarCaso("aprobado", { pedido: p, bodega: bodegaOk([p]), pedidos: [p] }, AHORA);
    assert.ok(ok.every((r) => r.ok), JSON.stringify(ok));
    const doble = { ...bodegaOk([p]), subscription_ends_at: "2026-12-01T00:00:00Z" };
    assert.ok(verificarCaso("duplicado", { pedido: p, bodega: doble, pedidos: [p] }, AHORA).some((r) => !r.ok));
  });
  it("rechazado, firma inválida o monto alterado: pedido sin pago y bodega en prueba", () => {
    const p = pedido(1, { status: "pending", payment_id: null, approved_at: null });
    const bodega = { id: ID(9), subscription_status: "trial", subscription_ends_at: null };
    for (const caso of ["rechazado", "pendiente", "firma-invalida", "monto-alterado"]) {
      assert.ok(verificarCaso(caso, { pedido: p, bodega, pedidos: [p] }, AHORA).every((r) => r.ok), caso);
      assert.ok(verificarCaso(caso, { pedido: { ...p, status: "paid", payment_id: "1" }, bodega, pedidos: [p] }, AHORA).some((r) => !r.ok), caso);
    }
  });
  it("reembolso y contracargo exigen su estado y la bodega sin esos meses", () => {
    const a = pedido(1, { status: "refunded" });
    const b = pedido(2, { approved_at: "2026-10-02T00:00:00Z", granted_until: "2026-11-02T00:00:00Z" });
    assert.ok(verificarCaso("reembolso", { pedido: a, bodega: bodegaOk([a, b]), pedidos: [a, b] }, AHORA).every((r) => r.ok));
    // El bug viejo: B seguía contando el mes de A.
    const conBug = { ...bodegaOk([a, b]), subscription_ends_at: "2026-12-01T00:00:00Z" };
    assert.ok(verificarCaso("reembolso", { pedido: a, bodega: conBug, pedidos: [a, b] }, AHORA).some((r) => !r.ok));
    assert.ok(verificarCaso("contracargo", { pedido: a, bodega: bodegaOk([a, b]), pedidos: [a, b] }, AHORA).some((r) => !r.ok));
  });
});

describe("seguridad del script", () => {
  it("se niega a producción y a http remoto", () => {
    assert.match(motivoParaNegarse("https://jvjcifyfepwhdmhnzzjo.supabase.co"), /PRODUCCIÓN/);
    assert.ok(motivoParaNegarse("http://prueba.supabase.co"));
    assert.equal(motivoParaNegarse("https://prueba123.supabase.co"), null);
    assert.equal(motivoParaNegarse("http://localhost:54321"), null);
  });
  it("valida argumentos", () => {
    assert.throws(() => leerArgumentos(["borrar-todo"]));
    assert.throws(() => leerArgumentos(["aprobado"]));
    assert.throws(() => leerArgumentos(["aprobado", "--pedido", "1; drop table"]));
    assert.throws(() => leerArgumentos(["apilado"]));
    assert.equal(leerArgumentos(["aprobado", "--pedido", ID(1)]).pedido, ID(1));
  });
  it("solo hace GET a la API REST", async () => {
    const vistos = [];
    const fakeFetch = async (url, options) => {
      vistos.push(options.method);
      if (url.includes("membership_orders?id=eq.")) return Response.json([pedido(1)]);
      if (url.includes("merchants?id=eq.")) return Response.json([{ id: ID(9), subscription_status: "active_monthly", subscription_ends_at: null }]);
      if (url.includes("membership_orders?merchant_id=eq.")) return Response.json([pedido(1)]);
      throw new Error(`URL inesperada ${url}`);
    };
    const datos = await cargar({ url: "https://prueba.supabase.co/", clave: "k", pedido: ID(1), bodega: null }, fakeFetch);
    assert.equal(datos.bodega.id, ID(9));
    assert.deepEqual(vistos, ["GET", "GET", "GET"]);
  });
});
