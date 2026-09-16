"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Loader2,
  LogIn,
  RefreshCw,
  Trash2,
  Upload,
  WifiOff,
} from "lucide-react";
import { describirPendiente, textoDeBorrado } from "@/lib/offline/cola";
import type { Pendiente } from "@/lib/offline/tipos";
import { diaLocal } from "@/lib/fechas";

/**
 * Lo único que le decimos a la bodeguera sobre la señal.
 *
 * Dos reglas mandan acá:
 *
 *  1. Nunca mostrar una cifra guardada como si fuera de ahora. Si los números
 *     vienen del teléfono, se dice con todas sus letras y con la hora.
 *  2. Nada que borre plata se hace de un toque. El botón dice cuánta plata se
 *     lleva y pregunta antes. Esto no es teórico: probando, un clic mío cayó
 *     ahí por accidente y borró una venta de S/ 15 sin preguntar nada.
 */
function cuando(iso: string | null): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";

  const hora = fecha.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);

  if (diaLocal(fecha) === diaLocal()) return `hoy a las ${hora}`;
  if (diaLocal(fecha) === diaLocal(ayer)) return `ayer a las ${hora}`;

  return `el ${fecha.toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
  })} a las ${hora}`;
}

export default function EstadoConexion({
  sinSenal,
  sesionCaida,
  guardadoEl,
  porMandar,
  trabados,
  sincronizando,
  onMandar,
  onVolverAEntrar,
  onReintentar,
  onDescartar,
}: {
  sinSenal: boolean;
  sesionCaida: boolean;
  guardadoEl: string | null;
  porMandar: number;
  trabados: Pendiente[];
  sincronizando: boolean;
  onMandar: () => void;
  onVolverAEntrar: () => void;
  onReintentar: (seq: number) => void;
  onDescartar: (seq: number) => void;
}) {
  // Qué anotación está esperando confirmación para borrarse.
  const [confirmando, setConfirmando] = useState<number | null>(null);

  if (!sinSenal && !sesionCaida && porMandar === 0 && trabados.length === 0) {
    return null;
  }

  const momento = cuando(guardadoEl);

  return (
    <div className="space-y-2">
      {/* La cuenta se cerró sola. No se trabó nada: falta la llave, no la plata. */}
      {sesionCaida && (
        <div className="bg-sky-50 border-2 border-sky-400 rounded-2xl p-3 space-y-2">
          <div className="flex items-start gap-2">
            <LogIn className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
            <div className="text-sm text-sky-900 leading-snug">
              <p className="font-bold">Tu cuenta se cerró sola.</p>
              <p className="mt-0.5">
                Lo que anotaste está guardado y no se perdió nada. Vuelve a
                entrar y se manda solo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onVolverAEntrar}
            className="w-full py-2.5 bg-sky-700 hover:bg-sky-800 text-white text-sm font-bold rounded-xl transition-colors"
          >
            Volver a entrar
          </button>
        </div>
      )}

      {sinSenal && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex items-start gap-2">
          <WifiOff className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-snug">
            <p className="font-bold">Sin señal. Puedes seguir anotando.</p>
            <p className="mt-0.5 font-medium">
              {momento
                ? `Los números que ves quedaron guardados en el teléfono ${momento}. Si alguien anotó algo después desde otro celular, todavía no lo ves.`
                : "Todavía no habíamos guardado nada de este día en el teléfono, así que puede faltar lo que anotaste antes desde otro celular."}
            </p>
          </div>
        </div>
      )}

      {porMandar > 0 && (
        <div className="bg-slate-800 text-white rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Upload className="w-4 h-4 text-amber-300 shrink-0" />
            <p className="text-xs font-bold leading-snug">
              {porMandar === 1
                ? "Falta mandar 1 anotación"
                : `Falta mandar ${porMandar} anotaciones`}
              <span className="font-medium text-slate-300">
                {" "}
                · están guardadas en el teléfono
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onMandar}
            disabled={sincronizando}
            className="shrink-0 flex items-center gap-1 bg-white/15 hover:bg-white/25 rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:opacity-60"
          >
            {sincronizando ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Mandar
          </button>
        </div>
      )}

      {trabados.length > 0 && (
        <div className="bg-rose-50 border border-rose-300 rounded-2xl p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-rose-900 leading-snug">
              Esto no se pudo mandar y necesita que tú decidas. No se cambió
              ninguna cifra sola.
            </p>
          </div>

          {trabados.map((pendiente) => {
            const textos = textoDeBorrado(pendiente);
            const preguntando = confirmando === pendiente.seq;

            return (
              <div
                key={pendiente.seq}
                className="bg-white rounded-xl border border-rose-200 p-3 space-y-2"
              >
                <p className="text-sm font-bold text-slate-900">
                  {describirPendiente(pendiente)}
                </p>
                <p className="text-xs text-slate-700 leading-snug">
                  {pendiente.motivo}
                </p>

                {preguntando ? (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 space-y-2">
                    <p className="text-sm font-bold text-rose-900">
                      {textos.pregunta}
                    </p>
                    <p className="text-xs text-slate-700 leading-snug">
                      {textos.detalle}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmando(null)}
                        className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition-colors"
                      >
                        No, dejarla
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmando(null);
                          onDescartar(pendiente.seq);
                        }}
                        className="py-2.5 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-lg transition-colors"
                      >
                        Sí, borrarla
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => onReintentar(pendiente.seq)}
                      disabled={sincronizando}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      {sincronizando ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Reintentar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(pendiente.seq)}
                      className="w-full py-2 text-slate-600 hover:text-rose-700 hover:bg-rose-50 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {textos.boton}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
