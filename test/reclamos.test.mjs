import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "./helpers/alias.mjs";

const { CAMPOS } = await import("../src/content/legal/reclamaciones.ts");
const { validarReclamo, campoVisible, CONDICIONALES, mensajeErrorReclamo } = await import("../src/lib/reclamos.ts");

const HOY = "2026-10-06";
function completo(extra = {}) {
  const valores = {};
  for (const campo of CAMPOS) {
    if (!campo.obligatorio) continue;
    valores[campo.nombre] = campo.tipo === "opcion" ? campo.opciones[0]
      : campo.tipo === "email" ? "ana@example.test"
      : campo.tipo === "telefono" ? "987654321"
      : campo.tipo === "fecha" ? HOY
      : campo.tipo === "numero" ? "10"
      : "texto de prueba";
  }
  return { ...valores, ...extra };
}

// La base (03-legal-y-cuenta.sql) repite la lista de campos: si Legal cambia
// reclamaciones.ts y nadie actualiza el SQL, este test lo avisa.
test("los campos de la base coinciden con los de Legal", () => {
  const sql = readFileSync(new URL("../supabase/03-legal-y-cuenta.sql", import.meta.url), "utf8");
  const lista = (nombre) => {
    const bloque = sql.match(new RegExp(`${nombre} text\\[\\] := (?:v_obligatorios \\|\\| )?array\\[([^\\]]*)\\]`));
    assert.ok(bloque, `No encontré ${nombre} en el SQL`);
    return [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };
  const obligatorios = lista("v_obligatorios");
  const permitidos = [...obligatorios, ...lista("v_permitidos")];
  assert.deepEqual([...obligatorios].sort(), CAMPOS.filter((c) => c.obligatorio).map((c) => c.nombre).sort());
  assert.deepEqual([...permitidos].sort(), CAMPOS.map((c) => c.nombre).sort());
  // Opciones que la base comprueba a mano.
  const opciones = (nombre) => CAMPOS.find((c) => c.nombre === nombre).opciones;
  assert.deepEqual(opciones("claimType"), ["Reclamo", "Queja"]);
  assert.deepEqual(opciones("isMinor").slice().sort(), ["No", "Sí"]);
  assert.deepEqual(opciones("declaration"), ["Acepto"]);
  // Los campos condicionales existen de verdad.
  for (const [nombre, { campo, valor }] of Object.entries(CONDICIONALES)) {
    assert.ok(CAMPOS.some((c) => c.nombre === nombre), nombre);
    assert.ok(CAMPOS.find((c) => c.nombre === campo).opciones.includes(valor), campo);
  }
});

test("un formulario completo pasa y solo manda campos conocidos y normalizados", () => {
  const r = validarReclamo(CAMPOS, completo({ claimedAmount: " 29,5 ", paymentDate: "2026-10-01", campoExtra: "x", consumerName: "  Ana  " }), HOY);
  assert.equal(r.ok, true);
  assert.equal(r.datos.claimedAmount, "29.50");
  assert.equal(r.datos.consumerName, "Ana");
  assert.equal("campoExtra" in r.datos, false);
});

test("falta, formato y opciones se marcan por campo sin perder lo escrito", () => {
  const r = validarReclamo(CAMPOS, completo({ detail: "  ", email: "sin-arroba", phone: "abc", claimType: "Sugerencia", claimedAmount: "1e3", paymentDate: "2026-10-07" }), HOY);
  assert.equal(r.ok, false);
  for (const campo of ["detail", "email", "phone", "claimType", "claimedAmount", "paymentDate"]) assert.ok(r.errores[campo], campo);
  assert.equal(validarReclamo(CAMPOS, completo({ claimedAmount: "-5" }), HOY).ok, false);
  assert.equal(validarReclamo(CAMPOS, completo({ paymentDate: "2026-02-30" }), HOY).ok, false);
  assert.equal(validarReclamo(CAMPOS, completo({ detail: "x".repeat(3001) }), HOY).ok, false);
});

test("menor de edad: aparecen y se exigen los datos del apoderado", () => {
  const apoderado = CAMPOS.find((c) => c.nombre === "guardianName");
  assert.equal(campoVisible(apoderado, completo({ isMinor: "No" })), false);
  assert.equal(campoVisible(apoderado, completo({ isMinor: "Sí" })), true);
  const sinApoderado = validarReclamo(CAMPOS, completo({ isMinor: "Sí" }), HOY);
  assert.equal(sinApoderado.ok, false);
  assert.ok(sinApoderado.errores.guardianName && sinApoderado.errores.guardianContact);
  // Si no es menor, lo que haya quedado escrito en esos campos no se manda.
  const adulto = validarReclamo(CAMPOS, completo({ isMinor: "No", guardianName: "Rosa" }), HOY);
  assert.equal(adulto.ok, true);
  assert.equal("guardianName" in adulto.datos, false);
  assert.equal(validarReclamo(CAMPOS, completo({ isMinor: "Sí", guardianName: "Rosa", guardianContact: "999888777" }), HOY).ok, true);
});

test("errores de la base se traducen sin mostrar textos técnicos", () => {
  assert.match(mensajeErrorReclamo({ message: "RECLAMO_FALTA_CAMPO" }), /Revisa el formulario/);
  assert.match(mensajeErrorReclamo({ message: "TypeError: Failed to fetch" }), /sigue en el formulario/);
});

test("fallaDeEnvio: red o servidor sí, dato inválido no", async () => {
  const { fallaDeEnvio } = await import("../src/lib/reclamos.ts");
  assert.equal(fallaDeEnvio({ message: "TypeError: Failed to fetch" }), true);
  assert.equal(fallaDeEnvio({ message: "project paused" }), true);
  assert.equal(fallaDeEnvio({ message: "RECLAMO_INVALIDO" }), false);
  assert.equal(fallaDeEnvio({ message: "RECLAMO_FALTA_CAMPO" }), false);
});

test("canal alternativo y aviso: constantes presentes", async () => {
  const doc = await import("../src/content/legal/reclamaciones.ts");
  assert.match(doc.AVISO_LIBRO, /TEXTO OFICIAL PENDIENTE/);
  assert.equal(doc.URL_TU_LIBRO, "https://consumidor.indecopi.gob.pe/tulibro/");
  assert.ok(doc.SECCIONES[0].parrafos[1].includes(doc.CORREO_CONTACTO));
});
