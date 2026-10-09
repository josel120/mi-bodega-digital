import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/alias.mjs";

const { CAMPOS, CORREO_CONTACTO } = await import("../src/content/legal/reclamaciones.ts");
const {
  ETIQUETAS, CORREO_CONTACTO_DEFECTO, REMITENTE, VENTANA_MS,
  construirCorreoReclamo, escaparHtml, createCopiaReclamoHandler,
} = await import("../supabase/functions/_shared/copia-reclamo.mjs");

const ORIGEN = "https://app.example.test";
const FILA = {
  codigo: "MBD-2026-000007",
  email: "ana@example.test",
  created_at: "2026-10-09T15:00:00.000Z",
  datos: { consumerName: "Ana <b>Pérez</b>", email: "ana@example.test", detail: "Línea 1\nLínea 2 & \"comillas\"", claimType: "Reclamo" },
};

test("las etiquetas del correo cubren los mismos campos que Legal", () => {
  assert.deepEqual(ETIQUETAS.map(([n]) => n), CAMPOS.map((c) => c.nombre));
});

test("el correo de contacto del servidor coincide con el de Legal", () => {
  assert.equal(CORREO_CONTACTO_DEFECTO, CORREO_CONTACTO);
  assert.equal(CORREO_CONTACTO, "josegomez120@gmail.com");
});

test("escaparHtml neutraliza etiquetas y comillas", () => {
  assert.equal(escaparHtml(`<img src=x onerror="a()">&'`), "&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;");
});

test("el correo trae código, fecha de Lima, plazo y datos escapados", () => {
  const c = construirCorreoReclamo({ codigo: FILA.codigo, fecha: FILA.created_at, datos: FILA.datos });
  assert.match(c.asunto, /MBD-2026-000007/);
  assert.ok(!c.html.includes("<b>Pérez</b>"));
  assert.ok(c.html.includes("Ana &lt;b&gt;Pérez&lt;/b&gt;"));
  assert.ok(c.html.includes("&quot;comillas&quot;"));
  assert.match(c.texto, /15 días hábiles/);
  assert.match(c.texto, /Fecha y hora \(Lima\):.*10/); // 15:00Z = 10:00 en Lima
  assert.match(c.texto, /Nombre y apellidos: Ana <b>Pérez<\/b>/); // texto plano no se escapa
  assert.match(c.texto, /Línea 1\nLínea 2/);
  assert.ok(c.texto.includes("[RAZÓN SOCIAL]") && c.texto.includes("[RUC]") && c.texto.includes("[DOMICILIO]"));
  assert.ok(c.texto.includes("josegomez120@gmail.com"));
});

test("los campos vacíos no salen y el asunto es de una sola línea", () => {
  const c = construirCorreoReclamo({ codigo: "MBD-2026-000007\nBcc: x@y.z", fecha: FILA.created_at, datos: { consumerName: "Ana", guardianName: "  " } });
  assert.ok(!c.texto.includes("Nombre del padre"));
  assert.ok(!/[\r\n]/.test(c.asunto));
});

function armar({ fila = FILA, envio = async () => {}, config = {} } = {}) {
  const llamadas = { claim: [], release: [], send: [] };
  const handler = createCopiaReclamoHandler({
    config: { appOrigin: ORIGEN, enabled: true, contacto: CORREO_CONTACTO, ...config },
    ahora: () => new Date("2026-10-09T15:10:00.000Z"),
    claim: async (codigo, desde) => { llamadas.claim.push([codigo, desde]); const f = fila; fila = null; return f; },
    release: async (codigo) => { llamadas.release.push(codigo); },
    send: async (m) => { llamadas.send.push(m); await envio(m); },
  });
  return { handler, llamadas };
}
const pedir = (handler, body, { origin = ORIGEN, method = "POST" } = {}) =>
  handler(new Request("https://f.example.test/", { method, headers: { origin, "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined }));

test("envía una sola vez al correo guardado, con copia oculta y responder a contacto", async () => {
  const { handler, llamadas } = armar();
  const r = await pedir(handler, { codigo: FILA.codigo, email: "otro@example.test" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { enviada: true });
  const [m] = llamadas.send;
  assert.equal(m.para, "ana@example.test"); // el correo que mande el navegador se ignora
  assert.equal(m.bcc, CORREO_CONTACTO);
  assert.equal(m.replyTo, CORREO_CONTACTO);
  assert.equal(m.idempotencyKey, "copia-reclamo-MBD-2026-000007");
  assert.equal(llamadas.claim[0][1], new Date(Date.parse("2026-10-09T15:10:00.000Z") - VENTANA_MS).toISOString());
  assert.match(REMITENTE, /^Mi Bodega Digital <no-reply@gaia-nexus\.com>$/);

  const otra = await pedir(handler, { codigo: FILA.codigo }); // segunda llamada: ya reservada
  assert.deepEqual(await otra.json(), { enviada: false, motivo: "no_corresponde" });
  assert.equal(llamadas.send.length, 1);
});

test("si el envío falla libera la reserva y responde 502 sin bloquear nada", async () => {
  const { handler, llamadas } = armar({ envio: async () => { throw new Error("boom"); } });
  const r = await pedir(handler, { codigo: FILA.codigo });
  assert.equal(r.status, 502);
  assert.equal((await r.json()).enviada, false);
  assert.deepEqual(llamadas.release, [FILA.codigo]);
});

test("rechaza otro origen, códigos mal formados y servicio sin configurar", async () => {
  const { handler, llamadas } = armar();
  assert.equal((await pedir(handler, { codigo: FILA.codigo }, { origin: "https://malo.example.test" })).status, 403);
  assert.equal((await pedir(handler, { codigo: "MBD-2026-1; drop" })).status, 400);
  assert.equal((await pedir(handler, {})).status, 400);
  assert.equal((await pedir(handler, null, { method: "GET" })).status, 405);
  assert.equal(llamadas.claim.length, 0);
  const apagada = armar({ config: { enabled: false } });
  const r = await pedir(apagada.handler, { codigo: FILA.codigo });
  assert.equal(r.status, 503);
  assert.equal(apagada.llamadas.claim.length, 0);
});
