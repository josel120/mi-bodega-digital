import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/alias.mjs";
import { instalarIndexedDbFalso } from "./helpers/fake-indexeddb.mjs";

instalarIndexedDbFalso();

// localStorage en memoria con la misma interfaz que el del navegador.
function almacenFalso() {
  const datos = new Map();
  return {
    get length() { return datos.size; },
    key: (i) => [...datos.keys()][i] ?? null,
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => { datos.set(k, String(v)); },
    removeItem: (k) => { datos.delete(k); },
    clear: () => datos.clear(),
  };
}
globalThis.localStorage = almacenFalso();
globalThis.sessionStorage = almacenFalso();

const { limpiarDispositivo } = await import("../src/lib/dispositivo.ts");
const { guardarFiados, leerFiados } = await import("../src/lib/offline/almacen.ts");
const { leerTodo, TIENDA_FIADOS } = await import("../src/lib/offline/db.ts");
const { confirmacionValida, mensajeErrorBorrado } = await import("../src/lib/cuenta.ts");

test("al salir o borrar la cuenta no quedan fiados ni la bodega en el teléfono", async () => {
  const fiado = { id: "f1", merchant_id: "m1", customer_name: "Doña Rosa", phone_number: "987654321", balance: 20, updated_at: "2026-10-06T00:00:00Z" };
  await guardarFiados("m1", [fiado]);
  assert.equal((await leerFiados("m1")).filas.length, 1);
  localStorage.setItem("mi-bodega-digital:bodega", JSON.stringify({ id: "m1", user_id: "u1" }));
  localStorage.setItem("mi-bodega-digital:otra-cosa", "x");
  sessionStorage.setItem("mi-bodega-digital:temporal", "x");
  localStorage.setItem("de-otra-app", "se queda");

  await limpiarDispositivo();

  assert.equal(localStorage.getItem("mi-bodega-digital:bodega"), null);
  assert.equal(localStorage.getItem("mi-bodega-digital:otra-cosa"), null);
  assert.equal(sessionStorage.getItem("mi-bodega-digital:temporal"), null);
  assert.equal(localStorage.getItem("de-otra-app"), "se queda");
  assert.deepEqual(await leerTodo(TIENDA_FIADOS), []);
});

test("limpiar no revienta aunque el almacenamiento esté bloqueado", async () => {
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
  try {
    await limpiarDispositivo();
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: original });
  }
});

test("confirmación de borrado: hay que escribir BORRAR a propósito", () => {
  for (const ok of ["BORRAR", "borrar", " Borrar "]) assert.equal(confirmacionValida(ok), true, ok);
  for (const no of ["", "BORRA", "BORRAR CUENTA", "si", "B O R R A R"]) assert.equal(confirmacionValida(no), false, no);
  assert.equal(mensajeErrorBorrado({ error: "Vuelve a iniciar sesión." }), "Vuelve a iniciar sesión.");
  assert.match(mensajeErrorBorrado(null), /Revisa tu señal/);
  assert.match(mensajeErrorBorrado({ error: 42 }), /Revisa tu señal/);
});
