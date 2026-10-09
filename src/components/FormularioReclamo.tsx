"use client";

import { useState } from "react";
import { Loader2, Printer, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import CanalAlternativoReclamo from "@/components/CanalAlternativoReclamo";
import ErrorToast from "@/components/ErrorToast";
import { diaLocal } from "@/lib/fechas";
import {
  campoObligatorio,
  campoVisible,
  fallaDeEnvio,
  mensajeErrorReclamo,
  validarReclamo,
  MAX_AREA,
  MAX_TEXTO,
  type CampoReclamo,
} from "@/lib/reclamos";

interface Constancia {
  codigo: string;
  fecha: string;
  datos: Record<string, string>;
}

const CLASE_INPUT =
  "w-full px-3 py-3 text-base border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 aria-[invalid=true]:border-rose-500";

function fechaLima(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "long",
    timeStyle: "short",
  });
}

/**
 * Hoja de reclamación virtual. Se arma con los CAMPOS que define Legal en
 * src/content/legal/reclamaciones.ts; no hay que tocar este archivo si Legal
 * cambia una etiqueta. Si cambia un campo obligatorio, hay que cambiar también
 * `registrar_reclamo` en el SQL (test/reclamos.test.mjs lo avisa).
 */
export default function FormularioReclamo({ campos }: { campos: CampoReclamo[] }) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [canalAlterno, setCanalAlterno] = useState(false);
  const [constancia, setConstancia] = useState<Constancia | null>(null);

  const cambiar = (nombre: string, valor: string) => {
    setValores((v) => ({ ...v, [nombre]: valor }));
    setErrores((e) => {
      if (!e[nombre]) return e;
      const resto = { ...e };
      delete resto[nombre];
      return resto;
    });
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    const resultado = validarReclamo(campos, valores, diaLocal());
    if (!resultado.ok) {
      setErrores(resultado.errores);
      const primero = campos.find((c) => resultado.errores[c.nombre]);
      if (primero) document.getElementById(`campo-${primero.nombre}`)?.focus();
      setErrorMsg("Falta completar o corregir algunos datos. Están marcados en rojo.");
      return;
    }

    setEnviando(true);
    setErrorMsg(null);
    setCanalAlterno(false);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("registrar_reclamo", {
        p_datos: resultado.datos,
      });
      const respuesta = data as { codigo?: unknown; fecha?: unknown } | null;
      if (error || typeof respuesta?.codigo !== "string" || typeof respuesta?.fecha !== "string") {
        // No se guardó: el formulario queda tal cual para volver a enviar.
        setErrorMsg(mensajeErrorReclamo(error));
        setCanalAlterno(fallaDeEnvio(error));
        return;
      }
      setConstancia({ codigo: respuesta.codigo, fecha: respuesta.fecha, datos: resultado.datos });
      window.scrollTo({ top: 0 });
    } catch {
      setErrorMsg(mensajeErrorReclamo(null));
      setCanalAlterno(true);
    } finally {
      setEnviando(false);
    }
  };

  if (constancia) {
    return (
      <section aria-labelledby="titulo-constancia" className="mt-8 p-4 bg-white border-2 border-emerald-600 rounded-2xl">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
          <h2 id="titulo-constancia" className="text-lg font-bold text-slate-900">
            Constancia de tu hoja de reclamación
          </h2>
        </div>
        <dl className="mt-3 text-base">
          <dt className="text-slate-600">Número</dt>
          <dd className="text-xl font-bold text-slate-900 break-all">{constancia.codigo}</dd>
          <dt className="text-slate-600 mt-2">Fecha y hora (Lima)</dt>
          <dd className="font-semibold">{fechaLima(constancia.fecha)}</dd>
        </dl>
        <p className="text-base mt-3">
          Guarda este número. Te respondemos por escrito en un plazo máximo de
          15 días hábiles por el medio que elegiste.
        </p>
        <dl className="mt-4 text-base border-t border-slate-200 pt-3 space-y-2">
          {campos
            .filter((c) => constancia.datos[c.nombre] !== undefined)
            .map((c) => (
              <div key={c.nombre}>
                <dt className="text-slate-600">{c.etiqueta}</dt>
                <dd className="whitespace-pre-wrap break-words">{constancia.datos[c.nombre]}</dd>
              </div>
            ))}
        </dl>
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 w-full min-h-12 inline-flex items-center justify-center gap-2 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl print:hidden"
        >
          <Printer className="w-5 h-5" aria-hidden="true" />
          Imprimir o guardar como PDF
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="mt-8 space-y-5" aria-labelledby="titulo-hoja">
      <h2 id="titulo-hoja" className="text-lg font-bold text-slate-900">
        Hoja de reclamación
      </h2>
      <p className="text-base text-slate-600">
        Los campos con <span aria-hidden="true">*</span>
        <span className="sr-only">asterisco</span> son obligatorios.
      </p>

      {campos.filter((c) => campoVisible(c, valores)).map((campo) => {
        const id = `campo-${campo.nombre}`;
        const error = errores[campo.nombre];
        const obligatorio = campoObligatorio(campo, valores);
        const valor = valores[campo.nombre] ?? "";
        const comunes = {
          id,
          name: campo.nombre,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": error ? `${id}-error` : undefined,
          "aria-required": obligatorio || undefined,
        } as const;
        const etiqueta = (
          <>
            {campo.etiqueta}
            {obligatorio && <span aria-hidden="true" className="text-rose-600"> *</span>}
          </>
        );
        const mensaje = error && (
          <p id={`${id}-error`} className="text-base text-rose-700 mt-1">
            {error}
          </p>
        );

        // Una sola opción ("Acepto"): es la firma, va como casilla.
        if (campo.tipo === "opcion" && campo.opciones?.length === 1) {
          const opcion = campo.opciones[0];
          return (
            <div key={campo.nombre}>
              <label className="flex items-start gap-3 min-h-11 text-base cursor-pointer">
                <input
                  type="checkbox"
                  {...comunes}
                  checked={valor === opcion}
                  onChange={(e) => cambiar(campo.nombre, e.target.checked ? opcion : "")}
                  className="w-6 h-6 mt-0.5 accent-emerald-600 shrink-0"
                />
                <span>{etiqueta}</span>
              </label>
              {mensaje}
            </div>
          );
        }

        if (campo.tipo === "opcion") {
          return (
            <fieldset key={campo.nombre} aria-describedby={comunes["aria-describedby"]}>
              <legend className="text-base font-semibold text-slate-800 mb-1">{etiqueta}</legend>
              <div className="space-y-1">
                {(campo.opciones ?? []).map((opcion, i) => (
                  <label key={opcion} className="flex items-center gap-3 min-h-11 text-base cursor-pointer">
                    <input
                      type="radio"
                      id={i === 0 ? id : undefined}
                      name={campo.nombre}
                      value={opcion}
                      checked={valor === opcion}
                      onChange={() => cambiar(campo.nombre, opcion)}
                      className="w-6 h-6 accent-emerald-600 shrink-0"
                    />
                    {opcion}
                  </label>
                ))}
              </div>
              {mensaje}
            </fieldset>
          );
        }

        let control: React.ReactNode;
        if (campo.tipo === "area") {
          control = (
            <textarea
              {...comunes}
              rows={5}
              maxLength={MAX_AREA}
              value={valor}
              onChange={(e) => cambiar(campo.nombre, e.target.value)}
              className={CLASE_INPUT}
            />
          );
        } else {
          // Plata: type="text" + inputMode="decimal", nunca type="number"
          // (descarta "29,50" en silencio). Ver src/lib/money.ts.
          const tipo =
            campo.tipo === "email" ? { type: "email", inputMode: "email", autoComplete: "email" }
            : campo.tipo === "telefono" ? { type: "tel", inputMode: "tel", autoComplete: "tel" }
            : campo.tipo === "numero" ? { type: "text", inputMode: "decimal", placeholder: "Ej. 29.00" }
            : campo.tipo === "fecha" ? { type: "date", max: diaLocal() }
            : { type: "text" };
          control = (
            <input
              {...comunes}
              {...(tipo as React.InputHTMLAttributes<HTMLInputElement>)}
              maxLength={MAX_TEXTO}
              value={valor}
              onChange={(e) => cambiar(campo.nombre, e.target.value)}
              className={CLASE_INPUT}
            />
          );
        }

        return (
          <div key={campo.nombre}>
            <label htmlFor={id} className="block text-base font-semibold text-slate-800 mb-1">
              {etiqueta}
            </label>
            {control}
            {mensaje}
          </div>
        );
      })}

      <button
        type="submit"
        disabled={enviando}
        className="w-full min-h-12 inline-flex items-center justify-center gap-2 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-60"
      >
        {enviando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : null}
        {enviando ? "Enviando…" : "Enviar hoja de reclamación"}
      </button>

      {canalAlterno && <CanalAlternativoReclamo />}

      <ErrorToast message={errorMsg} onClose={() => setErrorMsg(null)} />
    </form>
  );
}
