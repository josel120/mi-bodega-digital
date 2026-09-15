// Una sola fuente de verdad para el prefijo de rutas.
//
// En GitHub Pages la app vive en https://<usuario>.github.io/mi-bodega-digital,
// asi que el manifest, los iconos y el service worker necesitan ese prefijo
// escrito a mano (Next no lo agrega en metadata ni en archivos de /public).
//
// Lo calculamos con NODE_ENV, que Next siempre reemplaza al compilar, en vez de
// leer una variable de entorno: asi el valor no depende de que la configuracion
// del repo sobreviva al pipeline de CI.
export const BASE_PATH: string =
  process.env.NODE_ENV === "production" ? "/mi-bodega-digital" : "";
