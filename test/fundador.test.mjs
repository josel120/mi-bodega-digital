import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseEstadoFundador, esFundadorAgotado } from "../src/lib/fundador.ts";

const base = { cap: 30, taken: 12, remaining: 18, is_founder: false, can_buy: true };

describe("estado del plan fundador", () => {
  it("lee la respuesta de la base", () => {
    assert.deepEqual(parseEstadoFundador(base), { cap: 30, taken: 12, remaining: 18, isFounder: false, canBuy: true });
    assert.equal(parseEstadoFundador({ ...base, taken: 30, remaining: 0, can_buy: false })?.canBuy, false);
  });
  it("respuestas raras o ausentes ocultan el plan en vez de inventar cupos", () => {
    for (const malo of [null, undefined, "x", 3, {}, { ...base, cap: 0 }, { ...base, remaining: -1 }, { ...base, remaining: "18" }, { ...base, can_buy: "true" }, { ...base, is_founder: undefined }]) {
      assert.equal(parseEstadoFundador(malo), null);
    }
  });
  it("detecta el 409 de cupos agotados que manda la Edge Function", async () => {
    const respuesta = (cuerpo) => new Response(JSON.stringify(cuerpo), { status: 409 });
    assert.equal(await esFundadorAgotado({ context: respuesta({ code: "founder_sold_out" }) }), true);
    assert.equal(await esFundadorAgotado({ context: respuesta({ error: "otro" }) }), false);
    assert.equal(await esFundadorAgotado({ context: new Response("no json", { status: 500 }) }), false);
    assert.equal(await esFundadorAgotado(new Error("red")), false);
    assert.equal(await esFundadorAgotado(null), false);
  });
});
