"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, Save, Trash2, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { guardarBodega, leerBodegaGuardada, loadMerchant, sesionLocal } from "@/lib/merchant";
import { leerCola } from "@/lib/offline/cola";
import { limpiarDispositivo } from "@/lib/dispositivo";
import {
  CONFIRMACION_BORRADO,
  NOMBRE_BODEGA_MAX,
  confirmacionValida,
  mensajeErrorBorrado,
  normalizarYape,
  validarNombreBodega,
} from "@/lib/cuenta";
import type { Merchant } from "@/types/database";
import { ENLACES_LEGALES } from "@/components/PaginaLegal";
import ErrorToast from "@/components/ErrorToast";

// Mi cuenta: documentos legales y "Borrar mi cuenta y mis datos" (Ley 29733).
// El borrado lo hace la Edge Function `borrar-cuenta`; acá solo se pide la
// confirmación y, si salió bien, se limpia el teléfono.
export default function CuentaPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [cargando, setCargando] = useState(true);
  const [correo, setCorreo] = useState<string | null>(null);
  const [bodega, setBodega] = useState<string | null>(null);
  const [sinSubir, setSinSubir] = useState(0);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [nombre, setNombre] = useState("");
  const [yape, setYape] = useState("");
  const [errNombre, setErrNombre] = useState<string | null>(null);
  const [errYape, setErrYape] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [borrada, setBorrada] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      const user = await sesionLocal(supabase);
      if (!vivo) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      const guardada = leerBodegaGuardada(user.id);
      // Los datos de la bodega salen del servidor; sin señal, de lo guardado.
      const { merchant: remota } = await loadMerchant(supabase, user.id).catch(() => ({
        merchant: null,
        error: null,
      }));
      if (!vivo) return;
      const actual = remota ?? guardada;
      if (actual) {
        setMerchant(actual);
        setNombre(actual.business_name);
        setYape(actual.yape_number ?? "");
      }
      const pendientes = guardada ? await leerCola(guardada.id).catch(() => []) : [];
      if (!vivo) return;
      setCorreo(user.email ?? null);
      setBodega(actual?.business_name ?? null);
      setSinSubir(pendientes.length);
      setCargando(false);
    }
    void cargar();
    return () => {
      vivo = false;
    };
  }, [router, supabase]);

  const guardarAjustes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando || !merchant) return;
    const n = validarNombreBodega(nombre);
    const y = normalizarYape(yape);
    setErrNombre(n.ok ? null : n.error);
    setErrYape(y.ok ? null : y.error);
    setGuardado(false);
    if (!n.ok || !y.ok) return;
    setGuardando(true);
    try {
      const { data, error } = await supabase
        .from("merchants")
        .update({ business_name: n.valor, yape_number: y.valor })
        .eq("id", merchant.id)
        .select("*")
        .single();
      if (error || !data) {
        // El formulario conserva lo escrito para reintentar.
        setErrorMsg("No pudimos guardar los cambios. Revisa tu señal y vuelve a intentar.");
        return;
      }
      const nueva = data as Merchant;
      guardarBodega(nueva);
      setMerchant(nueva);
      setBodega(nueva.business_name);
      setNombre(nueva.business_name);
      setYape(nueva.yape_number ?? "");
      setGuardado(true);
    } catch {
      setErrorMsg("No pudimos guardar los cambios. Revisa tu señal y vuelve a intentar.");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!confirmacionValida(texto) || borrando) return;
    setBorrando(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.functions.invoke("borrar-cuenta", {
        body: { confirmacion: CONFIRMACION_BORRADO },
      });
      if (error) {
        let cuerpo: unknown = null;
        if (error instanceof FunctionsHttpError) {
          cuerpo = await (error.context as Response).json().catch(() => null);
        }
        // No se borró (o no se terminó): no limpiamos el teléfono, así la
        // persona puede reintentar o seguir usando la app.
        setErrorMsg(mensajeErrorBorrado(cuerpo));
        return;
      }
      await limpiarDispositivo();
      // El usuario ya no existe en Auth: solo se borra la sesión local.
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      setBorrada(true);
    } catch {
      setErrorMsg(mensajeErrorBorrado(null));
    } finally {
      setBorrando(false);
    }
  };

  if (borrada) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" aria-hidden="true" />
          <h1 className="text-xl font-bold text-slate-900 mt-3">Tu cuenta se borró</h1>
          <p className="text-base text-slate-700 mt-2">
            Borramos tu bodega, tus ventas, tus gastos y tus fiados, y también
            lo que quedaba guardado en este celular.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="mt-5 w-full min-h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
          >
            Ir al inicio
          </button>
        </div>
      </main>
    );
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="bg-emerald-600 text-white p-4 shadow-md flex items-center gap-2">
        <UserCog className="w-6 h-6 text-emerald-200" aria-hidden="true" />
        <h1 className="font-bold text-lg">Mi cuenta</h1>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        <section className="bg-white rounded-2xl p-4 border border-slate-200/60">
          {bodega && <p className="text-lg font-bold text-slate-900">{bodega}</p>}
          {correo && <p className="text-base text-slate-600 break-all">{correo}</p>}
        </section>

        {merchant && (
          <section className="bg-white rounded-2xl p-4 border border-slate-200/60" aria-labelledby="titulo-ajustes">
            <h2 id="titulo-ajustes" className="text-base font-bold text-slate-900">
              Datos de mi bodega
            </h2>
            <form onSubmit={(e) => void guardarAjustes(e)} className="mt-3 space-y-4" noValidate>
              <div>
                <label htmlFor="ajuste-nombre" className="block text-base font-semibold text-slate-800">
                  Nombre de la bodega
                </label>
                <input
                  id="ajuste-nombre"
                  type="text"
                  value={nombre}
                  maxLength={NOMBRE_BODEGA_MAX + 20}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    setGuardado(false);
                  }}
                  aria-invalid={errNombre ? true : undefined}
                  aria-describedby={errNombre ? "error-nombre" : undefined}
                  className="mt-1 w-full min-h-11 px-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {errNombre && (
                  <p id="error-nombre" className="mt-1 text-sm text-rose-700">
                    {errNombre}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="ajuste-yape" className="block text-base font-semibold text-slate-800">
                  Número de Yape / Plin (opcional)
                </label>
                <input
                  id="ajuste-yape"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={yape}
                  onChange={(e) => {
                    setYape(e.target.value);
                    setGuardado(false);
                  }}
                  aria-invalid={errYape ? true : undefined}
                  aria-describedby={errYape ? "error-yape" : "ayuda-yape"}
                  className="mt-1 w-full min-h-11 px-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {errYape ? (
                  <p id="error-yape" className="mt-1 text-sm text-rose-700">
                    {errYape}
                  </p>
                ) : (
                  <p id="ayuda-yape" className="mt-1 text-sm text-slate-600">
                    Es el número que sale en los cobros por WhatsApp.
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={guardando}
                className="w-full min-h-12 inline-flex items-center justify-center gap-2 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-50"
              >
                {guardando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Save className="w-5 h-5" aria-hidden="true" />}
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
              <p role="status" className="text-base font-semibold text-emerald-700 empty:hidden">
                {guardado ? "Cambios guardados." : ""}
              </p>
            </form>
          </section>
        )}

        <section className="bg-white rounded-2xl border border-slate-200/60" aria-labelledby="titulo-docs">
          <h2 id="titulo-docs" className="text-base font-bold text-slate-900 px-4 pt-4 pb-2">
            Documentos
          </h2>
          <ul>
            {ENLACES_LEGALES.map((enlace) => (
              <li key={enlace.href} className="border-t border-slate-100">
                <Link
                  href={enlace.href}
                  className="flex items-center justify-between min-h-12 px-4 text-base text-slate-800 hover:bg-slate-50"
                >
                  {enlace.etiqueta}
                  <ChevronRight className="w-5 h-5 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-2xl p-4 border border-rose-200" aria-labelledby="titulo-borrar">
          <h2 id="titulo-borrar" className="text-base font-bold text-rose-700">
            Borrar mi cuenta y mis datos
          </h2>
          {!abierto ? (
            <button
              type="button"
              onClick={() => setAbierto(true)}
              aria-expanded={false}
              className="mt-3 w-full min-h-12 inline-flex items-center justify-center gap-2 text-base font-bold border-2 border-rose-300 text-rose-700 rounded-xl hover:bg-rose-50"
            >
              <Trash2 className="w-5 h-5" aria-hidden="true" />
              Quiero borrar mi cuenta
            </button>
          ) : (
            <div className="mt-3 space-y-3 text-base text-slate-800">
              <p>Esto no se puede deshacer. Se borra para siempre:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>tu bodega y tu usuario,</li>
                <li>todas tus ventas y gastos,</li>
                <li>tus fiados, con los nombres y celulares de tus clientes,</li>
                <li>lo guardado en este celular.</li>
              </ul>
              <p>
                Por ley guardamos el registro de los pagos de tu plan (monto,
                fecha y número de operación), sin tu nombre ni tu correo.
              </p>
              {sinSubir > 0 && (
                <p className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                  Tienes {sinSubir} {sinSubir === 1 ? "anotación" : "anotaciones"} sin subir. También se perderán.
                </p>
              )}
              <label htmlFor="confirmar-borrado" className="block font-semibold">
                Escribe {CONFIRMACION_BORRADO} para confirmar
              </label>
              <input
                id="confirmar-borrado"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="w-full px-3 py-3 text-base border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <button
                type="button"
                onClick={() => void borrar()}
                disabled={!confirmacionValida(texto) || borrando}
                className="w-full min-h-12 inline-flex items-center justify-center gap-2 text-base font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl disabled:opacity-50"
              >
                {borrando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-5 h-5" aria-hidden="true" />}
                {borrando ? "Borrando…" : "Borrar mi cuenta para siempre"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAbierto(false);
                  setTexto("");
                }}
                disabled={borrando}
                className="w-full min-h-12 text-base font-semibold text-slate-600 rounded-xl hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          )}
        </section>
      </main>

      <ErrorToast message={errorMsg} onClose={() => setErrorMsg(null)} />
    </div>
  );
}
