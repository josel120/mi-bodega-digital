"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  contadorDeSubidas,
  descartarPendiente,
  leerCola,
  subirPendientes,
  suscribirseACola,
} from "./cola";
import type { Pendiente } from "./tipos";

/**
 * La cola vista desde una pantalla, y los momentos en que se intenta subir.
 *
 * Cuándo se reintenta: al abrir la pantalla, cuando el navegador avisa que
 * volvió la red, cuando la bodeguera vuelve a la app (bloquear y desbloquear el
 * celular es el gesto más común del mostrador), y cada 20 segundos mientras
 * quede algo sin subir.
 *
 * No usamos la Background Sync API a propósito: no existe en iOS y en Android
 * depende de que el sistema decida despertarnos. Reintentar en primer plano es
 * menos elegante y funciona en todos lados.
 */
export function useCola(supabase: SupabaseClient, merchantId: string | null) {
  const [cola, setCola] = useState<Pendiente[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  // Cambia cada vez que algo sube de verdad; las pantallas lo usan para volver
  // a preguntarle al servidor y quedarse con la versión oficial.
  const [subidasHechas, setSubidasHechas] = useState(0);

  const refrescar = useCallback(async () => {
    setSubidasHechas(contadorDeSubidas());
    if (!merchantId) {
      setCola([]);
      return;
    }
    setCola(await leerCola(merchantId));
  }, [merchantId]);

  useEffect(() => {
    const releer = () => {
      void refrescar();
    };
    const dejarDeEscuchar = suscribirseACola(releer);
    // La primera lectura va fuera del cuerpo del efecto para no encadenar
    // renders (react-hooks/set-state-in-effect).
    const id = setTimeout(releer, 0);
    return () => {
      clearTimeout(id);
      dejarDeEscuchar();
    };
  }, [refrescar]);

  const sincronizarAhora = useCallback(async () => {
    if (!merchantId) return;
    setSincronizando(true);
    try {
      await subirPendientes(supabase, merchantId);
    } finally {
      setSincronizando(false);
    }
  }, [supabase, merchantId]);

  useEffect(() => {
    if (!merchantId) return;

    const intentar = () => {
      void sincronizarAhora();
    };
    const alVolverAMirar = () => {
      if (document.visibilityState === "visible") intentar();
    };

    const id = setTimeout(intentar, 0);
    window.addEventListener("online", intentar);
    document.addEventListener("visibilitychange", alVolverAMirar);
    return () => {
      clearTimeout(id);
      window.removeEventListener("online", intentar);
      document.removeEventListener("visibilitychange", alVolverAMirar);
    };
  }, [merchantId, sincronizarAhora]);

  const porSubir = useMemo(() => cola.filter((p) => !p.trabado), [cola]);
  const trabados = useMemo(() => cola.filter((p) => p.trabado), [cola]);
  const hayPorSubir = porSubir.length > 0;

  useEffect(() => {
    if (!hayPorSubir || !merchantId) return;
    const id = setInterval(() => {
      if (navigator.onLine !== false) void sincronizarAhora();
    }, 20000);
    return () => clearInterval(id);
  }, [hayPorSubir, merchantId, sincronizarAhora]);

  const descartar = useCallback(async (seq: number) => {
    await descartarPendiente(seq);
  }, []);

  return {
    cola,
    porSubir,
    trabados,
    sincronizando,
    subidasHechas,
    sincronizarAhora,
    descartar,
  };
}
