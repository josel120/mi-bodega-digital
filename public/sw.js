// Service worker de Mi Bodega Digital.
// Objetivo: que la app se pueda instalar y que ABRA aunque no haya señal.
// Los datos del día siguen necesitando internet (vienen de Supabase).
// Sube CACHE_VERSION cada vez que quieras forzar una limpieza de caché.

const CACHE_VERSION = "v1";
const CACHE_NAME = `bodega-digital-${CACHE_VERSION}`;
const BASE = "/mi-bodega-digital";
const FALLBACK = `${BASE}/dashboard/`;

const SHELL = [
  `${BASE}/`,
  `${BASE}/dashboard/`,
  `${BASE}/debts/`,
  `${BASE}/login/`,
  `${BASE}/subscription/`,
  `${BASE}/manifest.json`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
  `${BASE}/icons/apple-touch-icon.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Uno por uno: si una ruta falla, la instalación no se cae entera.
      Promise.allSettled(SHELL.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Nunca tocamos otros dominios. En particular Supabase: servir plata y
  // fiados desde caché mostraría cifras viejas como si fueran de hoy.
  if (url.origin !== self.location.origin) return;

  // Navegación: primero la red, y si no hay señal, lo último que guardamos.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ||
            (await cache.match(FALLBACK)) ||
            Response.error()
          );
        })
    );
    return;
  }

  // Assets con hash en el nombre: caché primero, que no cambian nunca.
  const isStatic =
    url.pathname.includes("/_next/static/") ||
    url.pathname.startsWith(`${BASE}/icons/`);

  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // El resto: red, con la caché como red de seguridad.
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((c) => c || Response.error()))
  );
});
