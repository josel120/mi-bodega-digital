// src/app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Mail, Lock, Phone, ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";

export default function LoginPage() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [yapeNumber, setYapeNumber] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      if (isRegistering) {
        // 1. Registro de usuario en Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp(
          {
            email,
            password,
          },
        );

        if (authError) throw authError;

        if (authData.user) {
          // 2. Creación automática del registro en la tabla 'merchants' con 7 días de Trial
          const { error: merchantError } = await supabase
            .from("merchants")
            .insert([
              {
                user_id: authData.user.id,
                business_name: businessName,
                yape_number: yapeNumber || null,
                currency: "S/",
                subscription_status: "trial",
              },
            ]);

          if (merchantError) throw merchantError;
        }
        router.push("/dashboard");
      } else {
        // Iniciar Sesión
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        router.push("/dashboard");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Ocurrió un error inesperado al autenticar.";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-emerald-600 p-6 text-white text-center">
          <div className="inline-flex p-3 bg-emerald-500/30 rounded-2xl mb-3">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Mi Bodega Digital</h1>
          <p className="text-emerald-100 text-sm mt-1">
            {isRegistering
              ? "Crea tu cuenta con 7 días gratis"
              : "Ingresa a tu cuaderno de ventas"}
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          <button
            type="button"
            onClick={() => {
              setIsRegistering(false);
              setErrorMsg(null);
            }}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              !isRegistering
                ? "text-emerald-600 border-b-2 border-emerald-600 bg-white"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegistering(true);
              setErrorMsg(null);
            }}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${
              isRegistering
                ? "text-emerald-600 border-b-2 border-emerald-600 bg-white"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            Registrar Bodega
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleAuth} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-xl border border-red-100">
              {errorMsg}
            </div>
          )}

          {isRegistering && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nombre de la Bodega o Comercio
                </label>
                <div className="relative">
                  <Store className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    placeholder="Ej. Bodega Don Pepe"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Número de Yape / Plin (Opcional)
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    placeholder="Ej. 987654321"
                    value={yapeNumber}
                    onChange={(e) => setYapeNumber(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>
                  {isRegistering ? "Comenzar Prueba Gratis" : "Ingresar"}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
