"use client";

import { useState } from "react";
import { Store, Phone, Loader2, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Merchant } from "@/types/database";

/**
 * Pantalla de rescate: el usuario tiene cuenta pero no tiene bodega.
 *
 * Pasa cuando el registro se corta despues de crear el usuario y antes de
 * guardar la bodega. Antes esto dejaba la cuenta muerta; ahora le pedimos el
 * dato que falta y sigue trabajando sin tener que crear otro correo.
 */
export default function MerchantOnboarding({
  userId,
  onCreated,
}: {
  userId: string;
  onCreated: (merchant: Merchant) => void;
}) {
  const [businessName, setBusinessName] = useState("");
  const [yapeNumber, setYapeNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) return;

    setSaving(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("merchants")
      .insert([
        {
          user_id: userId,
          business_name: businessName.trim(),
          yape_number: yapeNumber.trim() || null,
          currency: "S/",
          subscription_status: "trial",
        },
      ])
      .select()
      .single();

    if (error || !data) {
      setErrorMsg(
        "No pudimos guardar tu bodega. Revisa tu señal e intenta de nuevo.",
      );
      setSaving(false);
      return;
    }

    onCreated(data as Merchant);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-emerald-600 p-6 text-white text-center">
          <div className="inline-flex p-3 bg-emerald-500/30 rounded-2xl mb-3">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold">Falta un último paso</h1>
          <p className="text-emerald-100 text-sm mt-1">
            Ponle nombre a tu bodega para empezar a anotar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-xl border border-red-100">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Nombre de la Bodega o Comercio
            </label>
            <div className="relative">
              <Store className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                autoFocus
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

          <button
            type="submit"
            disabled={saving || !businessName.trim()}
            className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>Entrar a mi caja</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
