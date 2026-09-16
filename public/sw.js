// Service worker de Mi Bodega Digital.
//
// Este archivo se ocupa SOLO del cascarón: que la app se pueda instalar y que
// abra aunque no haya señal (HTML, JavaScript, iconos).
//
// Los datos no pasan por acá a propósito. La caja del día y los fiados se
// guardan en IndexedDB desde la app (src/lib/offline/), que es donde se puede
// decir en pantalla "esto quedó guardado el martes a las 7" y "esto todavía no
// sube". Si sirviéramos las respuestas de Supabase desde la caché del service
// worker, el navegador mostraría cifras viejas como si fueran de hoy y nadie
// podría distinguirlas: con plata eso es peor que no mostrar nada.
//
// Sube CACHE_VERSION cada vez que quieras forzar una limpieza de caché.

const CACHE_VERSION = "v4";
const CACHE_NAME = `bodega-digital-${CACHE_VERSION}`;
const BASE = "/mi-bodega-digital";
const FALLBACK = `${BASE}/dashboard/`;

const SHELL = [
  `${BASE}/`,
  `${BASE}/dashboard/`,
  `${BASE}/debts/`,
  `${BASE}/login/`,
  `${BASE}/reset-password/`,
  `${BASE}/subscription/`,
  `${BASE}/manifest.json`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
  `${BASE}/icons/apple-touch-icon.png`,
];

/**
 * Guardar el HTML no alcanza.
 *
 * El HTML que genera Next para /dashboard/ es solo la ruedita de "cargando":
 * todo lo demás lo pinta el JavaScript. Si el HTML está en caché pero los
 * archivos .js no, la app "abre" y se queda girando para siempre — que es
 * exactamente lo que pasaba en modo avión.
 *
 * Los nombres de esos archivos llevan un hash que cambia en cada despliegue,
 * así que no se pueden escribir a mano acá. Los sacamos leyendo el HTML que
 * acabamos de guardar.
 */
async function guardarElArranque(cache) {
  const paginas = SHELL.filter((url) => url.endsWith("/"));
  const assets = new Set();

  for (const pagina of paginas) {
    try {
      const respuesta = await cache.match(pagina);
      if (!respuesta) continue;

      const html = await respuesta.text();
      const patron = /(?:src|href)="([^"]+\.(?:js|css|woff2))"/g;
      let encontrado;

      while ((encontrado = patron.exec(html)) !== null) {
        // Solo lo nuestro: nada de dominios ajenos.
        if (encontrado[1].startsWith(`${BASE}/`)) assets.add(encontrado[1]);
      }
    } catch {
      // Una página que no se pudo leer no puede tumbar la instalación entera.
    }
  }

  await Promise.allSettled([...assets].map((url) => cache.add(url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Uno por uno: si una ruta falla, la instalación no se cae entera.
      await Promise.allSettled(SHELL.map((url) => cache.add(url)));
      await guardarElArranque(cache);
    })()
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

  // Nunca tocamos otros dominios. En particular Supabase: de los datos se
  // encarga IndexedDB desde la app, que sí puede decir de cuándo son. Ver el
  // comentario de arriba.
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
