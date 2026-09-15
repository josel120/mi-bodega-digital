@AGENTS.md

# Reglas de este proyecto

Qué es el producto y cómo se corre está en `README.md`. Acá va solo lo que un
agente no puede deducir leyendo el código, y lo que ya se rompió una vez.

## La forma del sistema condiciona todo

No hay servidor. `output: "export"` genera archivos estáticos que sirve GitHub
Pages, y el navegador del bodeguero habla directo con Supabase con una clave
pública. De ahí salen tres reglas que no son opinables:

- **No escribas rutas de API.** Cualquier `fetch("/api/...")` es código muerto:
  no hay nada detrás. Si algo necesita un secreto o correr del lado del
  servidor, va en una Edge Function de Supabase. La pantalla de suscripción
  todavía llama a `/api/mercadopago/create-preference`; está apagada tras el
  flag `MOSTRAR_PLANES` justamente por eso.
- **La validación en el cliente es cortesía, no seguridad.** Lo único que de
  verdad protege los datos son las políticas RLS y las restricciones de
  Postgres. Si agregas una regla de negocio sobre plata, agrégala también en
  `supabase/01-endurecer-esquema.sql`.
- **No metas dependencias que necesiten Node en tiempo de ejecución.**

## El prefijo de ruta (`/mi-bodega-digital`) rompe cosas en silencio

La app no vive en la raíz del dominio. Next prefija los enlaces internos solo,
pero **no** las rutas de metadata (manifest, iconos) ni los archivos de
`public/`. Esas se arman a mano con `BASE_PATH` de `src/lib/base-path.ts`, que
es la única fuente de verdad: lo usan `next.config.ts`, el layout y el registro
del service worker. No lo dupliques ni lo leas de una variable de entorno.

Lo que ya pasó: el workflow usaba `static_site_generator: next` en
`actions/configure-pages`, y esa opción **escribe un `next.config.js` propio**
que le gana al `next.config.ts` del repo. Se perdieron `trailingSlash` y el
prefijo: `/dashboard/` devolvía 404, el manifest apuntaba a un archivo que no
existía y el service worker nunca se registró. La app parecía sana y llevaba
semanas sin poder instalarse. Si tocas el workflow, no devuelvas esa opción.

Después de cambiar algo del PWA, comprueba sobre la web publicada, no sobre
`out/`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://josel120.github.io/mi-bodega-digital/dashboard/
curl -s https://josel120.github.io/mi-bodega-digital/dashboard/ | grep -o '<link rel="manifest"[^>]*>'
```

El `href` del manifest tiene que empezar con `/mi-bodega-digital`. Si cambias
`public/sw.js`, sube `CACHE_VERSION` o los celulares se quedan con la versión
vieja.

## Esto es plata, no un CRUD

El usuario es una bodeguera cerrando caja, muchas veces con media raya de
señal. De ahí:

- **Toda operación que falla tiene que decirlo.** Nunca dejes un `if (!error)`
  sin el `else`. Antes, si el insert fallaba, el formulario se limpiaba igual y
  la venta simplemente no existía: peor que un error a la vista. Usa
  `ErrorToast` y **no vacíes el formulario** si no se guardó.
- **Los montos se leen con `parseAmount` / `parseMoney` de `src/lib/money.ts`,
  nunca con `parseFloat` suelto.** En Perú se escribe "12,50" tanto como
  "12.50", y `<input type="number">` descarta el valor con coma: el campo se ve
  lleno y la app recibe `""`. Por eso los campos de plata son `type="text"` con
  `inputMode="decimal"`.
- **Nada de recortar cifras en silencio.** Si un abono supera la deuda, se
  avisa; no se hace `Math.max(0, ...)` y a otra cosa.

## Cargar la bodega: nunca con `.single()`

Usa `loadMerchant()` de `src/lib/merchant.ts`. `.single()` exige exactamente
una fila y revienta con cero o con dos, y las dos cosas pasan de verdad: el
registro puede crear el usuario en Auth y perder la señal antes de guardar la
bodega, y la tabla no tiene UNIQUE en `user_id`. Cuando reventaba, la app
mandaba al usuario a `/login`, desde ahí entraba bien, y volvía a rebotar: la
cuenta quedaba muerta sin manera de recuperarla.

Si no hay bodega, **no expulses al usuario**: renderiza `MerchantOnboarding`,
que pide el dato que falta y lo deja seguir.

## Idioma

Todo lo que ve el bodeguero va en castellano peruano y llano: "Caja Diaria",
"Fiados", "Abonó", "Fió más". Los comentarios del código también van en
castellano y explican *por qué*, no *qué*.

## Antes de dar algo por terminado

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Los tres tienen que pasar. No hay tests automatizados todavía; si tocas plata o
fiados, prueba el flujo a mano en el navegador.
