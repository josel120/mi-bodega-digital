"use client";

import { useEffect } from "react";

const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Registra el service worker que permite instalar la app y abrirla sin
 * internet. Solo corre en producción: en `next dev` el archivo no se sirve
 * bajo el mismo basePath y un SW activo confunde la recarga en caliente.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register(`${BP}/sw.js`, { scope: `${BP}/` })
        .catch((error) => {
          console.error("No se pudo registrar el service worker:", error);
        });
    };

    // Esperamos al load para no competir con la carga inicial de la página.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
