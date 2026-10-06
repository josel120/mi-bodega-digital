import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/alias.mjs";
import { instalarIndexedDbFalso } from "./helpers/fake-indexeddb.mjs";

instalarIndexedDbFalso();
const cola = await import("../src/lib/offline/cola.ts");

const SIN_RED = { message: "TypeError: Failed to fetch", code: "" };

/**
 * Supabase falso: guarda filas en memoria y deja frenar o cortar la red de
 * cada consulta para reproducir una subida que todavía va por el aire.
 */
function supabaseFalso() {
  const servidor = { transactions: new Map(), customers_debts: new Map() };
  const control = { antes: null };

  async function ejecutar(e) {
    if (control.antes) {
      const corte = await control.antes(e);
      if (corte) return { data: null, error: corte };
    }
    const filas = servidor[e.tabla];
    const coincide = (f) => e.filtros.every(([c, v]) => f[c] === v);
    switch (e.accion) {
      case "insert":
        for (const f of e.datos) {
          if (filas.has(f.id)) return { data: null, error: { code: "23505", message: "duplicate key" } };
          filas.set(f.id, { ...f });
        }
        return { data: null, error: null };
      case "update": {
        const cambiadas = [];
        for (const f of filas.values()) {
          if (coincide(f)) {
            Object.assign(f, e.datos);
            cambiadas.push({ ...f });
          }
        }
        return { data: cambiadas, error: null };
      }
      case "delete":
        for (const [k, f] of filas) if (coincide(f)) filas.delete(k);
        return { data: null, error: null };
      default:
        return { data: [...filas.values()].filter(coincide), error: null };
    }
  }

  const client = {
    from(tabla) {
      const e = { tabla, accion: null, datos: null, filtros: [] };
      const q = {
        insert: (d) => ((e.accion = "insert"), (e.datos = d), q),
        update: (d) => ((e.accion = "update"), (e.datos = d), q),
        delete: () => ((e.accion = "delete"), q),
        select: () => ((e.accion ??= "select"), q),
        eq: (c, v) => (e.filtros.push([c, v]), q),
        limit: () => q,
        order: () => q,
        then: (ok, mal) => ejecutar(e).then(ok, mal),
      };
      return q;
    },
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "schema cache" } }),
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
  };

  return { client, servidor, control };
}

function venta(merchantId, id, amount) {
  return {
    id,
    merchant_id: merchantId,
    type: "income",
    amount,
    description: "",
    payment_method: "Efectivo",
    created_at: new Date().toISOString(),
  };
}

/** Freno para el primer INSERT: avisa cuando sale y espera a que lo suelten. */
function frenarPrimerInsert(control) {
  let salio;
  let soltar;
  const enElAire = new Promise((r) => (salio = r));
  const liberado = new Promise((r) => (soltar = r));
  control.antes = async (e) => {
    if (e.accion !== "insert") return null;
    control.antes = null;
    salio();
    await liberado;
    return null;
  };
  return { enElAire, soltar };
}

/** Lo mismo que hace la Caja Diaria al borrar o corregir (dashboard/page.tsx). */
async function borrarComoLaPantalla(client, merchantId, id) {
  const eraPendiente = await cola.borrarMovimientoDeCola(merchantId, id);
  if (eraPendiente) return;
  const r = await cola.anotar(
    client,
    cola.armarPendiente(merchantId, crypto.randomUUID(), { tipo: "borrar_movimiento", id }),
  );
  assert.equal(r.ok, true);
}

async function corregirComoLaPantalla(client, merchantId, id, cambios) {
  const eraPendiente = await cola.editarMovimientoEnCola(merchantId, id, cambios);
  if (eraPendiente) return;
  const r = await cola.anotar(
    client,
    cola.armarPendiente(merchantId, crypto.randomUUID(), { tipo: "editar_movimiento", id, cambios }),
  );
  assert.equal(r.ok, true);
}

async function vaciar(client, merchantId) {
  for (let i = 0; i < 5; i++) await cola.subirPendientes(client, merchantId);
}

test("borrar una venta mientras su INSERT va por el aire no la hace reaparecer", async () => {
  const M = "m-borrar";
  const { client, servidor, control } = supabaseFalso();
  const freno = frenarPrimerInsert(control);
  const fila = venta(M, crypto.randomUUID(), 50);

  const r = await cola.anotar(client, cola.armarPendiente(M, crypto.randomUUID(), { tipo: "crear_movimiento", fila }));
  assert.equal(r.ok, true);
  await freno.enElAire;

  // No debe quedarse esperando a la red: si esperara, esta prueba se colgaría.
  await borrarComoLaPantalla(client, M, fila.id);
  freno.soltar();
  await vaciar(client, M);

  assert.equal(servidor.transactions.has(fila.id), false, "la venta borrada quedó en el servidor");
  assert.equal((await cola.leerCola(M)).length, 0);
});

test("corregir una venta mientras su INSERT va por el aire no pierde la corrección", async () => {
  const M = "m-corregir";
  const { client, servidor, control } = supabaseFalso();
  const freno = frenarPrimerInsert(control);
  const fila = venta(M, crypto.randomUUID(), 50);

  await cola.anotar(client, cola.armarPendiente(M, crypto.randomUUID(), { tipo: "crear_movimiento", fila }));
  await freno.enElAire;

  await corregirComoLaPantalla(client, M, fila.id, {
    type: "income",
    amount: 5,
    description: "era 5",
    payment_method: "Yape",
  });
  freno.soltar();
  await vaciar(client, M);

  assert.equal(servidor.transactions.get(fila.id)?.amount, 5, "se perdió la corrección");
  assert.equal(servidor.transactions.get(fila.id)?.payment_method, "Yape");
  assert.equal((await cola.leerCola(M)).length, 0);
});

test("sin señal, corregir y borrar siguen resolviéndose dentro de la cola", async () => {
  const M = "m-sin-senal";
  const { client, servidor, control } = supabaseFalso();
  control.antes = async () => SIN_RED;
  const a = venta(M, crypto.randomUUID(), 10);
  const b = venta(M, crypto.randomUUID(), 20);

  await cola.anotar(client, cola.armarPendiente(M, crypto.randomUUID(), { tipo: "crear_movimiento", fila: a }));
  await cola.anotar(client, cola.armarPendiente(M, crypto.randomUUID(), { tipo: "crear_movimiento", fila: b }));
  await vaciar(client, M);

  assert.equal(
    await cola.editarMovimientoEnCola(M, a.id, { type: "expense", amount: 12, description: "", payment_method: "Efectivo" }),
    true,
  );
  assert.equal(await cola.borrarMovimientoDeCola(M, b.id), true);
  assert.equal((await cola.leerCola(M)).length, 1);

  control.antes = null;
  await vaciar(client, M);

  assert.equal(servidor.transactions.get(a.id)?.amount, 12);
  assert.equal(servidor.transactions.get(a.id)?.type, "expense");
  assert.equal(servidor.transactions.has(b.id), false);
  assert.equal((await cola.leerCola(M)).length, 0);
});
