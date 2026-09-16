// Ids decididos en el teléfono, no en Postgres.
//
// Es lo que hace que reintentar una subida no duplique la venta: el id viaja en
// el INSERT, así que el segundo intento choca contra la llave primaria y eso lo
// leemos como "ya estaba arriba".
//
// `crypto.randomUUID()` solo existe en contexto seguro (https o localhost), que
// es donde vive la app; el respaldo de abajo es para WebViews viejos de Android
// donde no está.
export function nuevoId(): string {
  const cripto = globalThis.crypto;

  if (cripto && typeof cripto.randomUUID === "function") {
    return cripto.randomUUID();
  }

  if (cripto && typeof cripto.getRandomValues === "function") {
    const bytes = cripto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Último recurso. Menos entropía, pero un id es mejor que ninguno: sin id no
  // hay idempotencia y la venta se puede duplicar.
  const aleatorio = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${aleatorio()}${aleatorio()}-${aleatorio()}-4${aleatorio().slice(1)}-a${aleatorio().slice(1)}-${aleatorio()}${aleatorio()}${aleatorio()}`;
}
