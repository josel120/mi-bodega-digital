import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseEstadoFundador, codigoFundador } from "../src/lib/fundador.ts";

const base = { cap: 30, taken: 12, remaining: 18, is_founder: false, can_buy: true, months_total: 6, months_left: 6, reason: "ok" };

describe("estado del plan fundador", () => {
  it("lee la respuesta de la base", () => {
    assert.deepEqual(parseEstadoFundador(base), { cap: 30, taken: 12, remaining: 18, isFounder: false, canBuy: true, monthsTotal: 6, monthsLeft: 6, reason: "ok" });
    for (const reason of ["sold_out", "closed", "ended"]) assert.equal(parseEstadoFundador({ ...base, can_buy: false, reason })?.reason, reason);
    assert.equal(parseEstadoFundador({ ...base, is_founder: true, months_left: 2 })?.monthsLeft, 2);
  });
  it("respuestas raras, incoherentes o ausentes ocultan el plan en vez de inventar cupos", () => {
    for (const malo of [null, undefined, "x", 3, {}, { ...base, cap: 0 }, { ...base, remaining: -1 }, { ...base, remaining: "18" }, { ...base, can_buy: "true" }, { ...base, is_founder: undefined },
      { ...base, months_total: 0 }, { ...base, months_left: 7 }, { ...base, months_left: undefined }, { ...base, reason: "otra" }, { ...base, reason: "closed" }, { ...base, can_buy: false }]) {
      assert.equal(parseEstadoFundador(malo), null);
    }
  });
  it("detecta los 409 del plan fundador que manda la Edge Function", async () => {
    const respuesta = (cuerpo) => new Response(JSON.stringify(cuerpo), { status: 409 });
    for (const code of ["founder_sold_out", "founder_closed", "founder_ended"]) assert.equal(await codigoFundador({ context: respuesta({ code }) }), code);
    assert.equal(await codigoFundador({ context: respuesta({ code: "otro" }) }), null);
    assert.equal(await codigoFundador({ context: respuesta({ error: "otro" }) }), null);
    assert.equal(await codigoFundador({ context: new Response("no json", { status: 500 }) }), null);
    assert.equal(await codigoFundador(new Error("red")), null);
    assert.equal(await codigoFundador(null), null);
  });
});
