import assert from "node:assert/strict";
import test from "node:test";

// La caja se lleva en hora de Lima (UTC-5, sin horario de verano).
process.env.TZ = "America/Lima";
const { diaLocal, diaLocalDeISO, esDiaFuturo } = await import("../src/lib/fechas.ts");

test("una venta de las 10:30 pm en Lima cae en el día de Lima, no en el de UTC", () => {
  assert.equal(diaLocalDeISO("2026-10-07T03:30:00.000Z"), "2026-10-06");
  assert.equal(diaLocalDeISO("2026-10-07T05:00:00.000Z"), "2026-10-07");
  assert.equal(diaLocalDeISO("no-es-fecha"), "");
  assert.equal(diaLocal(new Date("2026-01-01T04:59:59.000Z")), "2025-12-31");
});

test("esDiaFuturo bloquea mañana pero no hoy ni días pasados", () => {
  assert.equal(esDiaFuturo("2026-10-07", "2026-10-06"), true);
  assert.equal(esDiaFuturo("2027-01-01", "2026-12-31"), true);
  assert.equal(esDiaFuturo("2026-10-06", "2026-10-06"), false);
  assert.equal(esDiaFuturo("2026-09-30", "2026-10-06"), false);
});
