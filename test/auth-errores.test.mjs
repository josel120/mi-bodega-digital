import assert from "node:assert/strict";
import test from "node:test";
import { traducirErrorAuth } from "../src/lib/auth-errores.ts";

test("credenciales inválidas, por código y por texto", () => {
  const esperado = /correo o la contraseña no coinciden/;
  assert.match(traducirErrorAuth({ code: "invalid_credentials", message: "x" }), esperado);
  assert.match(traducirErrorAuth({ message: "Invalid login credentials", status: 400 }), esperado);
});

test("correo sin confirmar", () => {
  assert.match(traducirErrorAuth({ code: "email_not_confirmed" }), /confirmas tu correo/);
  assert.match(traducirErrorAuth({ message: "Email not confirmed" }), /confirmas tu correo/);
});

test("usuario ya registrado", () => {
  for (const err of [
    { code: "user_already_exists" },
    { code: "email_exists" },
    { message: "User already registered" },
  ]) {
    assert.match(traducirErrorAuth(err), /ya tiene una cuenta/, JSON.stringify(err));
  }
});

test("demasiados intentos / límite de envíos", () => {
  for (const err of [
    { code: "over_email_send_rate_limit" },
    { code: "over_request_rate_limit" },
    { message: "Email rate limit exceeded" },
    { message: "For security purposes, you can only request this after 42 seconds." },
    { message: "algo raro", status: 429 },
  ]) {
    assert.match(traducirErrorAuth(err), /muchos intentos/, JSON.stringify(err));
  }
});

test("sin señal", () => {
  assert.match(traducirErrorAuth({ name: "AuthRetryableFetchError", message: "Failed to fetch" }), /señal/);
  assert.match(traducirErrorAuth(new TypeError("Failed to fetch")), /señal/);
});

test("lo desconocido cae en un mensaje genérico en castellano, nunca en el inglés crudo", () => {
  for (const err of [{ message: "Database error saving new user", status: 500 }, null, undefined, "texto", 42, {}]) {
    const msg = traducirErrorAuth(err);
    assert.match(msg, /No pudimos completar la operación/, String(err));
    assert.doesNotMatch(msg, /Database error/);
  }
});
