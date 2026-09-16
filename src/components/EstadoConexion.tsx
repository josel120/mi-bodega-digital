"use client";

import { AlertTriangle, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { describirPendiente } from "@/lib/offline/cola";
import type { Pendiente } from "@/lib/offline/tipos";
import { diaLocal } from "@/lib/fechas";

/**
 * Lo único que le decimos a la bodeguera sobre la señal.
 *
 * La regla que manda acá: nunca mostrar una cifra guardada como si fuera de
 * ahora. Si los números vienen del teléfono, se dice con todas sus letras y con
 * la hora en que se bajaron. Si algo no subió, se dice cuántos son. Si algo se
 * trabó, se dice qué era y por cuánta plata, porque eso lo tiene que resolver
 * una persona, no el código.
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
  guardadoEl,
  porSubir,
  trabados,
  sincronizando,
  onReintentar,
  onDescartar,
}: {
  sinSenal: boolean;
  guardadoEl: string | null;
  porSubir: number;
  trabados: Pendiente[];
  sincronizando: boolean;
  onReintentar: () => void;
  onDescartar: (seq: number) => void;
}) {
  if (!sinSenal && porSubir === 0 && trabados.length === 0) return null;

  const momento = cuando(guardadoEl);

  return (
    <div className="space-y-2">
      {sinSenal && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex items-start gap-2">
          <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
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

      {porSubir > 0 && (
        <div className="bg-slate-800 text-white rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
            <p className="text-xs font-bold leading-snug">
              {porSubir === 1
                ? "1 anotación sin subir"
                : `${porSubir} anotaciones sin subir`}
              <span className="font-medium text-slate-300">
                {" "}
                · están guardadas en el teléfono
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onReintentar}
            disabled={sincronizando}
            className="shrink-0 flex items-center gap-1 bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-60"
          >
            {sincronizando ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Subir
          </button>
        </div>
      )}

      {trabados.length > 0 && (
        <div className="bg-rose-50 border border-rose-300 rounded-2xl p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-rose-900 leading-snug">
              Esto no se pudo subir y necesita que tú decidas. No se cambió
              ninguna cifra sola.
            </p>
          </div>

          {trabados.map((pendiente) => (
            <div
              key={pendiente.seq}
              className="bg-white rounded-xl border border-rose-200 p-2.5 space-y-1.5"
            >
              <p className="text-xs font-bold text-slate-800">
                {describirPendiente(pendiente)}
              </p>
              <p className="text-[11px] text-slate-600 leading-snug">
                {pendiente.motivo}
              </p>
              <button
                type="button"
                onClick={() => onDescartar(pendiente.seq)}
                className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors"
              >
                Ya lo resolví, quitar este aviso
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
