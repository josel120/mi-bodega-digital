// Copia automática de la hoja de reclamación al consumidor (Reglamento del
// Libro de Reclamaciones, art. 4-B).
//
// El navegador llama a esta función justo después de `registrar_reclamo`,
// solo con el código de la hoja. Todo lo demás se lee en el servidor, así que
// nadie puede pedir que se escriba a un correo distinto del que dejó la hoja.
// Una hoja nunca se rechaza ni se bloquea por un fallo de correo: este envío
// es un extra posterior al registro.
//
// Los handlers reciben adaptadores para poder probarse sin red ni claves
// (test/copia-reclamo.test.mjs).

export const CORREO_CONTACTO_DEFECTO = "josegomez120@gmail.com";
export const REMITENTE = "Mi Bodega Digital <no-reply@gaia-nexus.com>";
// Solo se envía la copia de hojas recién registradas: el código es correlativo
// (adivinable), así que una hoja vieja ya no puede disparar correos.
export const VENTANA_MS = 60 * 60 * 1000;
const CODIGO = /^MBD-\d{4}-\d{6}$/;

// Debe coincidir con CAMPOS de src/content/legal/reclamaciones.ts (el test lo verifica).
export const ETIQUETAS = [
  ["consumerName", "Nombre y apellidos"],
  ["documentType", "Tipo de documento"],
  ["documentNumber", "Número de documento"],
  ["address", "Domicilio"],
  ["phone", "Teléfono"],
  ["email", "Correo electrónico"],
  ["isMinor", "¿Eres menor de edad?"],
  ["guardianName", "Nombre del padre, madre o apoderado"],
  ["guardianContact", "Domicilio, teléfono o correo del padre, madre o apoderado"],
  ["itemType", "¿Sobre qué es?"],
  ["claimedAmount", "Monto reclamado (S/)"],
  ["itemDescription", "Descripción del servicio"],
  ["paymentDate", "Fecha del pago o del hecho"],
  ["claimType", "Tipo"],
  ["detail", "Detalle"],
  ["request", "Pedido"],
  ["responseChannel", "Medio de respuesta"],
  ["declaration", "Declaración"],
];

export function escaparHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fechaLima(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "long", timeStyle: "short" });
}

// Los saltos de línea y espacios iniciales del texto del consumidor no deben
// poder partir el asunto ni las cabeceras.
function unaLinea(texto) {
  return String(texto ?? "").replace(/[\r\n]+/g, " ").trim();
}

/**
 * Arma el correo (asunto, HTML y texto plano). Función pura: sin red ni reloj.
 * `datos` es lo que el consumidor escribió; se escapa todo.
 */
export function construirCorreoReclamo({ codigo, fecha, datos, contacto = CORREO_CONTACTO_DEFECTO }) {
  const filas = ETIQUETAS.filter(([nombre]) => String(datos?.[nombre] ?? "").trim() !== "").map(([nombre, etiqueta]) => [etiqueta, String(datos[nombre])]);
  const cuando = fechaLima(fecha);
  const proveedor = `Proveedor: [RAZÓN SOCIAL] · RUC [RUC] · Domicilio: [DOMICILIO] · Correo: ${contacto}`;
  const plazo = "Te respondemos por escrito en un plazo máximo de 15 días hábiles, por el medio que elegiste en tu hoja.";
  const pie = [
    "Recibes este correo porque registraste una hoja en el Libro de Reclamaciones virtual de Mi Bodega Digital. Es una copia automática que manda el sistema, como manda la ley; no hace falta que respondas para que tu hoja siga su curso.",
    "Usamos los datos de la hoja solo para atender tu reclamo o queja y los conservamos el tiempo que exige la norma (ver el Aviso de privacidad en la app).",
    `Si algo no está bien, escríbenos a ${contacto}.`,
  ];

  const texto = [
    `Mi Bodega Digital · Libro de Reclamaciones`,
    `Copia de tu hoja de reclamación`,
    ``,
    `Número: ${codigo}`,
    `Fecha y hora (Lima): ${cuando}`,
    proveedor,
    ``,
    ...filas.map(([etiqueta, valor]) => `${etiqueta}: ${valor}`),
    ``,
    plazo,
    ``,
    ...pie,
  ].join("\n");

  const html = [
    `<!doctype html><html lang="es"><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;padding:16px">`,
    `<h1 style="font-size:20px;margin:0 0 4px">Mi Bodega Digital · Libro de Reclamaciones</h1>`,
    `<p style="margin:0 0 16px;color:#475569">Copia de tu hoja de reclamación</p>`,
    `<p style="margin:0"><strong>Número:</strong> ${escaparHtml(codigo)}</p>`,
    `<p style="margin:0 0 8px"><strong>Fecha y hora (Lima):</strong> ${escaparHtml(cuando)}</p>`,
    `<p style="margin:0 0 16px">${escaparHtml(proveedor)}</p>`,
    `<table role="presentation" style="width:100%;border-collapse:collapse">`,
    ...filas.map(([etiqueta, valor]) => `<tr><td style="padding:6px 8px;border-top:1px solid #e2e8f0;color:#475569;vertical-align:top;width:40%">${escaparHtml(etiqueta)}</td><td style="padding:6px 8px;border-top:1px solid #e2e8f0;white-space:pre-wrap">${escaparHtml(valor)}</td></tr>`),
    `</table>`,
    `<p style="margin:16px 0"><strong>${escaparHtml(plazo)}</strong></p>`,
    ...pie.map((p) => `<p style="font-size:13px;color:#475569;margin:8px 0">${escaparHtml(p)}</p>`),
    `</body></html>`,
  ].join("\n");

  return {
    asunto: `Copia de tu hoja de reclamación ${unaLinea(codigo)} - Mi Bodega Digital`,
    html,
    texto,
  };
}

const reply = (status, body, headers = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * Handler HTTP. `deps`: config {appOrigin, enabled}, claim(codigo, desdeIso),
 * release(codigo), send({para, bcc, replyTo, asunto, html, texto, idempotencyKey}), log, ahora().
 * Respuestas sin datos de la hoja: nunca se devuelve el correo ni el contenido.
 */
export function createCopiaReclamoHandler(deps) {
  const log = (paso, estado) => deps.log?.({ funcion: "copia-reclamo", paso, estado });
  return async (request) => {
    const origin = request.headers.get("origin");
    const cors = { "Access-Control-Allow-Origin": deps.config.appOrigin, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" };
    if (!deps.config.appOrigin || origin !== deps.config.appOrigin) return reply(403, { enviada: false, error: "Origen no permitido." });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { enviada: false, error: "Usa POST." }, cors);
    if (!deps.config.enabled) return reply(503, { enviada: false, motivo: "no_disponible" }, cors);
    let body;
    try { body = await request.json(); } catch { return reply(400, { enviada: false, error: "Pedido inválido." }, cors); }
    const codigo = typeof body?.codigo === "string" ? body.codigo.trim() : "";
    if (!CODIGO.test(codigo)) return reply(400, { enviada: false, error: "Pedido inválido." }, cors);

    const desde = new Date(deps.ahora().getTime() - VENTANA_MS).toISOString();
    let fila;
    try { fila = await deps.claim(codigo, desde); } catch { log("reservar", "error"); return reply(503, { enviada: false, motivo: "no_disponible" }, cors); }
    // No existe, es vieja o ya se envió: misma respuesta, para no revelar cuáles códigos existen.
    if (!fila) return reply(200, { enviada: false, motivo: "no_corresponde" }, cors);

    try {
      const correo = construirCorreoReclamo({ codigo: fila.codigo, fecha: fila.created_at, datos: fila.datos, contacto: deps.config.contacto });
      await deps.send({
        para: fila.email,
        bcc: deps.config.contacto,
        replyTo: deps.config.contacto,
        asunto: correo.asunto,
        html: correo.html,
        texto: correo.texto,
        idempotencyKey: `copia-reclamo-${fila.codigo}`,
      });
    } catch {
      log("enviar", "error");
      // Se libera la marca para que un reintento pueda mandar la copia. La hoja sigue registrada.
      try { await deps.release(codigo); } catch { log("liberar", "error"); }
      return reply(502, { enviada: false, motivo: "fallo_envio" }, cors);
    }
    log("fin", "ok");
    return reply(200, { enviada: true }, cors);
  };
}

// Adaptador real: REST de Supabase (service_role) y la API HTTP de Resend.
// Los secretos salen solo del entorno de la función.
export function copiaReclamoRuntime(env, fetchImpl = fetch) {
  const supabaseUrl = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const appUrl = (env.APP_URL ?? "").replace(/\/$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const config = {
    appOrigin: appUrl ? new URL(appUrl).origin : "",
    contacto: env.CONTACT_EMAIL || CORREO_CONTACTO_DEFECTO,
    enabled: Boolean(supabaseUrl && appUrl && service && env.RESEND_API_KEY),
  };
  const headers = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  async function call(url, options) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Servicio respondió HTTP ${response.status}`);
    return response;
  }
  const deps = {
    config,
    ahora: () => new Date(),
    log: (entry) => console.error(JSON.stringify(entry)),
    // Reserva atómica: solo una llamada puede pasar de NULL a una fecha.
    claim: async (codigo, desdeIso) => {
      const query = `codigo=eq.${encodeURIComponent(codigo)}&copia_enviada_at=is.null&created_at=gte.${encodeURIComponent(desdeIso)}&select=codigo,email,datos,created_at`;
      const response = await call(`${supabaseUrl}/rest/v1/complaints?${query}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({ copia_enviada_at: new Date().toISOString() }),
      });
      const filas = await response.json();
      return Array.isArray(filas) && filas.length === 1 ? filas[0] : null;
    },
    release: async (codigo) => {
      await call(`${supabaseUrl}/rest/v1/complaints?codigo=eq.${encodeURIComponent(codigo)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ copia_enviada_at: null }),
      });
    },
    send: async ({ para, bcc, replyTo, asunto, html, texto, idempotencyKey }) => {
      await call("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ from: REMITENTE, to: [para], bcc: [bcc], reply_to: replyTo, subject: asunto, html, text: texto }),
      });
    },
  };
  return { copiaReclamo: createCopiaReclamoHandler(deps) };
}
