import assert from "node:assert/strict";
import test from "node:test";
import { parseAmount, parseMoney, parseSaldoInicial } from "../src/lib/money.ts";

test("parseMoney acepta coma o punto y redondea a céntimos sin error de coma flotante", () => {
  assert.equal(parseMoney("12,50"), 12.5);
  assert.equal(parseMoney("12.50"), 12.5);
  assert.equal(parseMoney(" 12 , 5 "), 12.5);
  assert.equal(parseMoney("0.1"), 0.1);
  assert.equal(parseMoney("12."), 12);
  assert.equal(parseMoney(",5"), 0.5);
  assert.equal(parseMoney("-0"), 0);
  assert.equal(Object.is(parseMoney("-0"), -0), false);
});

test("parseMoney rechaza lo que Number() convertía en otra cifra", () => {
  // Antes: "0x10" => 16, "1e3" => 1000, "1.005" => 1 y "1,005" => 1.
  for (const raro of ["0x10", "1e3", "Infinity", "1.005", "1,005", "1.250,50", "1,250.50", "12a", "abc", "", "  "]) {
    assert.equal(parseMoney(raro), null, raro);
  }
});

test("parseAmount solo deja pasar montos mayores a cero", () => {
  assert.equal(parseAmount("3,20"), 3.2);
  assert.equal(parseAmount("0"), null);
  assert.equal(parseAmount("-5"), null);
  assert.equal(parseAmount("0x10"), null);
});

test("parseSaldoInicial: vacío es cero, pero lo ilegible no se convierte en cero", () => {
  assert.deepEqual(parseSaldoInicial(""), { ok: true, saldo: 0 });
  assert.deepEqual(parseSaldoInicial("   "), { ok: true, saldo: 0 });
  assert.deepEqual(parseSaldoInicial("15,50"), { ok: true, saldo: 15.5 });
  // Antes `parseMoney(x) ?? 0` creaba al cliente debiendo S/ 0.00 sin avisar.
  assert.equal(parseSaldoInicial("12a").ok, false);
  assert.equal(parseSaldoInicial("1.250,50").ok, false);
  assert.equal(parseSaldoInicial("-3").ok, false);
});
