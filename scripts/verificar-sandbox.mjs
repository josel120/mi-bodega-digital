#!/usr/bin/env node
// Verifica, SOLO LEYENDO, el estado de la base de PRUEBA después de cada caso
// del sandbox de Mercado Pago (docs/sandbox-mercadopago.md).
//
// Uso:
//   SANDBOX_SUPABASE_URL=https://<ref-de-prueba>.supabase.co \
//   SANDBOX_SUPABASE_SERVICE_ROLE_KEY=<clave service_role DEL PROYECTO DE PRUEBA> \
//   node scripts/verificar-sandbox.mjs <caso> --pedido <uuid>
//   node scripts/verificar-sandbox.mjs apilado --bodega <uuid>
//   node scripts/verificar-sandbox.mjs invariantes --bodega <uuid>
//
// Casos: aprobado, duplicado, rechazado, pendiente, firma-invalida,
// monto-alterado, reembolso, contracargo, apilado, invariantes.
//
// Seguridad: solo hace GET a la API REST. Se niega a correr contra el
// proyecto de producción y no lee .env: las variables se pasan a mano.
// Sale con código 1 si algún chequeo falla.
import { pathToFileURL } from "node:url";

/** Proyecto real de producción: nunca se verifica contra él. */
export const PROYECTO_PRODUCCION = "jvjcifyfepwhdmhnzzjo";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TOLERANCIA_MS = 1000; // Postgres guarda microsegundos; JS, milisegundos.
export const CASOS = ["aprobado", "duplicado", "rechazado", "pendiente", "firma-invalida", "monto-alterado", "reembolso", "contracargo", "apilado", "invariantes"];

/** Suma meses como Postgres en UTC: 31 de enero + 1 mes = 28/29 de febrero. */
export function sumarMeses(fecha, meses) {
  const d = new Date(fecha);
  const dia = d.getUTCDate();
  const destino = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(dia, ultimo));
  return destino;
}

/**
 * Misma cadena que `recalcular_vigencia` (03-legal-y-cuenta.sql): pedidos
 * pagados por fecha de aprobación; cada uno empieza donde terminó el anterior
 * o el día que se aprobó, lo que sea más tarde.
 */
export function cadenaEsperada(pedidos, ahora = new Date()) {
  const pagados = pedidos
    .filter((p) => p.status === "paid")
    .sort((a, b) => Date.parse(a.approved_at) - Date.parse(b.approved_at) || a.id.localeCompare(b.id));
  const hasta = new Map();
  let fin = null;
  let plan = null;
  for (const p of pagados) {
    const inicio = new Date(Math.max(fin ? fin.getTime() : 0, Date.parse(p.approved_at)));
    fin = sumarMeses(inicio, p.plan_type === "monthly" ? 1 : 12);
    plan = p.plan_type;
    hasta.set(p.id, fin);
  }
  const vigente = fin && fin.getTime() > ahora.getTime();
  return {
    hasta,
    finBodega: vigente ? fin : null,
    estadoBodega: !vigente ? "inactive" : plan === "monthly" ? "active_monthly" : "active_yearly",
  };
}

const mismaFecha = (a, b) => (a === null || a === undefined || b === null)
  ? (a ?? null) === b
  : Math.abs(Date.parse(a) - b.getTime()) <= TOLERANCIA_MS;

/** Chequeos de la bodega contra la cadena de sus pedidos. */
export function verificarBodega(bodega, pedidos, ahora = new Date()) {
  const r = [];
  const cadena = cadenaEsperada(pedidos, ahora);
  for (const p of pedidos.filter((x) => x.status === "paid")) {
    r.push({ ok: mismaFecha(p.granted_until, cadena.hasta.get(p.id)), mensaje: `pedido ${p.id}: granted_until ${p.granted_until} = cadena ${cadena.hasta.get(p.id)?.toISOString()}` });
    r.push({ ok: Boolean(p.payment_id && p.approved_at), mensaje: `pedido ${p.id}: pagado con payment_id y approved_at` });
  }
  r.push({ ok: mismaFecha(bodega.subscription_ends_at, cadena.finBodega), mensaje: `bodega: subscription_ends_at ${bodega.subscription_ends_at} = ${cadena.finBodega?.toISOString() ?? "null"} (sin meses de pedidos devueltos ni repetidos)` });
  // Si ningún pago llegó a aplicarse, la bodega sigue en su prueba gratis.
  const nuncaAplicado = pedidos.every((p) => ["creating", "pending"].includes(p.status));
  const estadoOk = bodega.subscription_status === cadena.estadoBodega || (nuncaAplicado && bodega.subscription_status === "trial");
  r.push({ ok: estadoOk, mensaje: `bodega: subscription_status ${bodega.subscription_status} (esperado ${cadena.estadoBodega})` });
  const ids = pedidos.map((p) => p.payment_id).filter(Boolean);
  r.push({ ok: new Set(ids).size === ids.length, mensaje: "ningún pago acredita dos pedidos" });
  return r;
}

/** Chequeos del pedido según el caso probado. */
export function verificarCaso(caso, { pedido, bodega, pedidos }, ahora = new Date()) {
  const r = [];
  const sinPago = (motivo) => {
    r.push({ ok: ["creating", "pending"].includes(pedido.status), mensaje: `${motivo}: el pedido sigue ${pedido.status} (creating o pending)` });
    r.push({ ok: pedido.payment_id === null, mensaje: `${motivo}: el pedido no tiene payment_id` });
  };
  switch (caso) {
    case "aprobado":
    case "duplicado":
      r.push({ ok: pedido.status === "paid", mensaje: `el pedido quedó paid (está ${pedido.status})` });
      r.push({ ok: /^\d+$/.test(pedido.payment_id ?? ""), mensaje: "payment_id numérico de Mercado Pago" });
      break;
    case "rechazado": sinPago("pago rechazado"); break;
    case "pendiente": sinPago("pago pendiente"); break;
    case "firma-invalida": sinPago("firma inválida (debe responder 401)"); break;
    case "monto-alterado": sinPago("monto o moneda distinta (debe responder 422)"); break;
    case "reembolso":
      r.push({ ok: pedido.status === "refunded", mensaje: `el pedido quedó refunded (está ${pedido.status})` });
      break;
    case "contracargo":
      r.push({ ok: pedido.status === "charged_back", mensaje: `el pedido quedó charged_back (está ${pedido.status})` });
      break;
    case "apilado":
      r.push({ ok: pedidos.filter((p) => p.status === "paid").length >= 2, mensaje: "hay al menos dos pedidos pagados apilados" });
      break;
    case "invariantes": break;
    default: throw new Error(`Caso desconocido: ${caso}`);
  }
  if (bodega) r.push(...verificarBodega(bodega, pedidos, ahora));
  return r;
}

/** Revisa que la URL sea de un proyecto de prueba. Devuelve el motivo o null. */
export function motivoParaNegarse(url) {
  let u;
  try { u = new URL(url); } catch { return "SANDBOX_SUPABASE_URL no es una URL."; }
  if (u.hostname.includes(PROYECTO_PRODUCCION)) return "Esa URL es el proyecto de PRODUCCIÓN. Este script solo corre contra el proyecto de prueba.";
  const local = ["localhost", "127.0.0.1"].includes(u.hostname);
  if (u.protocol !== "https:" && !local) return "Usa https (o localhost para Supabase local).";
  return null;
}

export function leerArgumentos(argv) {
  const [caso, ...resto] = argv;
  const args = { caso, pedido: null, bodega: null };
  for (let i = 0; i < resto.length; i += 2) {
    if (resto[i] === "--pedido") args.pedido = resto[i + 1] ?? null;
    else if (resto[i] === "--bodega") args.bodega = resto[i + 1] ?? null;
    else throw new Error(`Opción desconocida: ${resto[i]}`);
  }
  if (!CASOS.includes(caso)) throw new Error(`Caso inválido. Usa uno de: ${CASOS.join(", ")}`);
  for (const id of [args.pedido, args.bodega]) if (id !== null && !UUID.test(id)) throw new Error(`No es un uuid: ${id}`);
  if (["apilado", "invariantes"].includes(caso) && !args.bodega) throw new Error(`${caso} necesita --bodega <uuid>`);
  if (!["apilado", "invariantes"].includes(caso) && !args.pedido) throw new Error(`${caso} necesita --pedido <uuid>`);
  return args;
}

/** Lee lo necesario por REST, solo con GET. */
export async function cargar({ url, clave, pedido, bodega }, fetchImpl = fetch) {
  const base = url.replace(/\/$/, "");
  const get = async (ruta) => {
    const respuesta = await fetchImpl(`${base}/rest/v1/${ruta}`, { method: "GET", headers: { apikey: clave, Authorization: `Bearer ${clave}`, Accept: "application/json" } });
    if (!respuesta.ok) throw new Error(`La API respondió HTTP ${respuesta.status} en ${ruta.split("?")[0]}`);
    return respuesta.json();
  };
  let filaPedido = null;
  let idBodega = bodega;
  if (pedido) {
    [filaPedido] = await get(`membership_orders?id=eq.${pedido}&select=*`);
    if (!filaPedido) throw new Error("No existe ese pedido en la base de prueba.");
    idBodega ??= filaPedido.merchant_id;
  }
  let filaBodega = null;
  let pedidos = [];
  if (idBodega) {
    [filaBodega] = await get(`merchants?id=eq.${idBodega}&select=id,subscription_status,subscription_ends_at`);
    pedidos = await get(`membership_orders?merchant_id=eq.${idBodega}&select=*&order=approved_at.asc.nullslast`);
  }
  return { pedido: filaPedido, bodega: filaBodega ?? null, pedidos };
}

async function main() {
  let args;
  try { args = leerArgumentos(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exit(2); }
  const url = process.env.SANDBOX_SUPABASE_URL ?? "";
  const clave = process.env.SANDBOX_SUPABASE_SERVICE_ROLE_KEY ?? "";
  const motivo = motivoParaNegarse(url);
  if (motivo || !clave) { console.error(motivo ?? "Falta SANDBOX_SUPABASE_SERVICE_ROLE_KEY."); process.exit(2); }
  const datos = await cargar({ url, clave, pedido: args.pedido, bodega: args.bodega });
  if (args.caso !== "invariantes" && args.caso !== "apilado" && !datos.pedido) { console.error("Sin pedido."); process.exit(2); }
  const resultados = verificarCaso(args.caso, datos.pedido ? datos : { ...datos, pedido: {} });
  for (const { ok, mensaje } of resultados) console.log(`${ok ? "OK   " : "FALLA"} ${mensaje}`);
  const fallas = resultados.filter((r) => !r.ok).length;
  console.log(fallas ? `\n${fallas} chequeo(s) fallaron.` : "\nTodo coincide con lo esperado.");
  process.exit(fallas ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => { console.error(`Error: ${e.message}`); process.exit(2); });
}
