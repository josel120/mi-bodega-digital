// El navegador tampoco debe redirigir a un dominio arbitrario si el pago falla.
export function checkoutUrl(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("init_point" in data) || typeof data.init_point !== "string") return null;
  try {
    const url = new URL(data.init_point);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["www.mercadopago.com.pe", "sandbox.mercadopago.com.pe"].includes(url.hostname) || !url.pathname.startsWith("/checkout/")) return null;
    return url.href;
  } catch { return null; }
}
