import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/alias.mjs";

// src/lib/consentimiento.ts importa las constantes con el alias "@/...", por
// eso necesita el hook de test/helpers/alias.mjs antes de cargarse.
const { construirConsentimiento, aceptoLegalValido } = await import(
  "../src/lib/consentimiento.ts"
);
const { ACTUALIZADO: VERSION_PRIVACIDAD } = await import(
  "../src/content/legal/privacidad.ts"
);
const { ACTUALIZADO: VERSION_TERMINOS } = await import(
  "../src/content/legal/terminos.ts"
);

test("construirConsentimiento: claves exactas, sin datos personales de más", () => {
  const consentimiento = construirConsentimiento(new Date().toISOString());
  assert.deepEqual(
    Object.keys(consentimiento).sort(),
    ["legal_accepted_at", "privacy_version", "terms_version"],
  );
});

test("construirConsentimiento: usa la fecha ISO recibida, no el reloj del sistema", () => {
  const ahora = "2026-10-07T12:34:56.000Z";
  const consentimiento = construirConsentimiento(ahora);
  assert.equal(consentimiento.legal_accepted_at, ahora);
  assert.match(
    consentimiento.legal_accepted_at,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  );

  const otraFecha = "2020-01-01T00:00:00.000Z";
  assert.equal(construirConsentimiento(otraFecha).legal_accepted_at, otraFecha);
});

test("construirConsentimiento: las versiones vienen de las constantes de Legal, no copiadas", () => {
  const consentimiento = construirConsentimiento("2026-10-07T00:00:00.000Z");
  assert.equal(consentimiento.privacy_version, VERSION_PRIVACIDAD);
  assert.equal(consentimiento.terms_version, VERSION_TERMINOS);
});

test("aceptoLegalValido: solo true habilita el registro", () => {
  assert.equal(aceptoLegalValido(true), true);
  assert.equal(aceptoLegalValido(false), false);
});
