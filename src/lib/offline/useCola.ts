"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  contadorDeSubidas,
  descartarPendiente,
  leerCola,
  reintentarPendiente,
  reintentarTodo,
  subirPendientes,
  suscribirseACola,
} from "./cola";
import type { Pendiente, ResultadoSubida } from "./tipos";

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
  // La cuenta se cerró sola: la cola está en pausa, no trabada.
  const [sesionCaida, setSesionCaida] = useState(false);
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

  /**
   * Devuelve el resultado, no lo tira.
   *
   * Antes esto se descartaba y apretar "Mandar" sin señal no cambiaba nada en
   * pantalla: ni un aviso, ni una letra. La bodeguera lo volvía a apretar.
   */
  const sincronizarAhora = useCallback(async (): Promise<
    ResultadoSubida | undefined
  > => {
    if (!merchantId) return undefined;
    setSincronizando(true);
    try {
      const resultado = await subirPendientes(supabase, merchantId);
      setSesionCaida(resultado.sesionCaida);
      return resultado;
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

  /** Destraba y vuelve a intentar en el acto, sin esperar los 20 segundos. */
  const reintentar = useCallback(
    async (seq: number) => {
      if (!merchantId) return undefined;
      await reintentarPendiente(merchantId, seq);
      return sincronizarAhora();
    },
    [merchantId, sincronizarAhora],
  );

  const reintentarTodos = useCallback(async () => {
    if (!merchantId) return undefined;
    await reintentarTodo(merchantId);
    return sincronizarAhora();
  }, [merchantId, sincronizarAhora]);

  return {
    cola,
    porSubir,
    trabados,
    sincronizando,
    sesionCaida,
    subidasHechas,
    sincronizarAhora,
    descartar,
    reintentar,
    reintentarTodos,
  };
}
