// src/app/reset-password/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Pantalla a la que llega el enlace del correo de "Olvidé mi contraseña".
 *
 * Supabase entrega la sesión de recuperación en el fragmento de la URL
 * (#access_token=...). El cliente del navegador la levanta solo, así que aquí
 * únicamente esperamos a que exista sesión y pedimos la clave nueva.
 */
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setHasSession(!!session);
      setChecking(false);
    }
    check();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMsg(error.message);
      setSaving(false);
      return;
    }

    setDone(true);
    setSaving(false);
    setTimeout(() => router.replace("/dashboard"), 1500);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-emerald-600 p-6 text-white text-center">
          <div className="inline-flex p-3 bg-emerald-500/30 rounded-2xl mb-3">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold">Nueva contraseña</h1>
          <p className="text-emerald-100 text-sm mt-1">
            Escríbela una vez y entras directo a tu caja
          </p>
        </div>

        <div className="p-6 space-y-4">
          {!hasSession ? (
            <>
              <div className="p-3 text-sm text-amber-700 bg-amber-50 rounded-xl border border-amber-100">
                Este enlace ya venció o se abrió en otro navegador. Pide uno
                nuevo desde la pantalla de ingreso.
              </div>
              <button
                type="button"
                onClick={() => router.replace("/login")}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-md"
              >
                Volver al ingreso
              </button>
            </>
          ) : done ? (
            <div className="p-3 text-sm text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-100">
              Listo, tu contraseña quedó cambiada. Te llevamos a tu caja...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="p-3 text-sm text-red-600 bg-red-50 rounded-xl border border-red-100">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Contraseña nueva
                </label>
                <div className="relative">
                  <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoFocus
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || password.length < 6}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Guardar y entrar</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
