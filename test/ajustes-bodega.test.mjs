import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizarYape, validarNombreBodega } from "../src/lib/cuenta.ts";

describe("ajustes de la bodega", () => {
  it("normaliza el Yape con espacios, guiones y prefijo", () => {
    for (const t of ["987654321", " 987 654 321 ", "987-654-321", "+51987654321", "51 987654321", "0051987654321"]) {
      assert.deepEqual(normalizarYape(t), { ok: true, valor: "987654321" }, t);
    }
  });
  it("vacío es válido y queda en null", () => {
    assert.deepEqual(normalizarYape("   "), { ok: true, valor: null });
  });
  it("rechaza números que no son celular peruano", () => {
    for (const t of ["12345", "887654321", "9876543210", "98765432a", "+1987654321", "5198765432"]) {
      assert.equal(normalizarYape(t).ok, false, t);
    }
  });
  it("valida el nombre de la bodega", () => {
    assert.deepEqual(validarNombreBodega("  Bodega   Doña  Rosa "), { ok: true, valor: "Bodega Doña Rosa" });
    assert.equal(validarNombreBodega("   ").ok, false);
    assert.equal(validarNombreBodega("x".repeat(61)).ok, false);
  });
});
