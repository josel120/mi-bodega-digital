// app/subscription/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Merchant } from "@/types/database";
import { MOSTRAR_PLANES } from "@/lib/features";
import { loadMerchant, sesionLocal } from "@/lib/merchant";
import MerchantOnboarding from "@/components/MerchantOnboarding";
import AvisoLibroReclamaciones from "@/components/AvisoLibroReclamaciones";
import ErrorToast from "@/components/ErrorToast";
import { checkoutUrl } from "@/lib/checkout";
import {
  CheckCircle2,
  Clock,
  ShieldCheck,
  ArrowRight,
  Loader2,
} from "lucide-react";

export default function SubscriptionPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [merchantLoaded, setMerchantLoaded] = useState(false);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const requestIds = useRef<Partial<Record<"monthly" | "yearly", string>>>({});

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Durante el piloto la pantalla de planes está apagada.
    if (!MOSTRAR_PLANES) {
      router.replace("/dashboard");
      return;
    }

    async function loadData() {
      const user = await sesionLocal(supabase);

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);
      const { merchant: merchantData, error } = await loadMerchant(supabase, user.id);
      if (error) setErrorMsg("No pudimos cargar tu plan. Revisa tu señal y vuelve a intentar.");
      else { setMerchant(merchantData); setMerchantLoaded(true); setCheckedAt(Date.now()); }
      // Los parámetros del regreso no prueban el pago; el estado viene de la base.
      if (new URLSearchParams(window.location.search).has("payment")) {
        setPaymentNotice("Estamos comprobando tu pago. Tu plan cambia cuando Mercado Pago lo confirma. Si ya pagaste, no vuelvas a pagar; usa «Revisar mi plan».");
      }
      setLoading(false);
    }

    void loadData().catch(() => {
      setErrorMsg("No pudimos cargar tu plan. Revisa tu señal y vuelve a intentar.");
      setLoading(false);
    });
  }, [router, supabase]);

  // Manejar redirección al Checkout / Preference de Mercado Pago
  const handleSubscribe = async (planType: "monthly" | "yearly") => {
    if (!merchant || processingPlan) return;
    setProcessingPlan(planType);
    setErrorMsg(null);

    try {
      // El id se conserva en un reintento; dueño y precio los decide el servidor.
      requestIds.current[planType] ??= crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke("crear-preferencia", {
        body: { planType, requestId: requestIds.current[planType] },
      });
      if (error) throw error;
      const url = checkoutUrl(data);
      if (!url) throw new Error("Enlace inválido");
      window.location.assign(url);
    } catch {
      setErrorMsg("No pudimos preparar el pago. Si ya pagaste, no vuelvas a pagar. Revisa tu plan más tarde.");
    } finally {
      setProcessingPlan(null);
    }
  };

  const refreshPlan = async () => {
    if (!userId) return;
    try {
      const { merchant: current, error } = await loadMerchant(supabase, userId);
      if (error || !current) throw new Error("Plan no disponible");
      setMerchant(current);
      setCheckedAt(Date.now());
      setPaymentNotice(current.subscription_ends_at && new Date(current.subscription_ends_at).getTime() > Date.now()
        ? "Tu pago está confirmado y tu plan está activo."
        : "Aún no vemos un plan pagado activo. Si ya pagaste, espera la confirmación; no vuelvas a pagar.");
    } catch { setErrorMsg("No pudimos revisar tu plan. Revisa tu señal e intenta de nuevo."); }
  };

  // Cálculo de días restantes de prueba
  const getDaysLeft = () => {
    if (!merchant?.trial_ends_at) return 0;
    const diffTime =
      new Date(merchant.trial_ends_at).getTime() - checkedAt;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  const daysLeft = getDaysLeft();
  if (!merchant && userId && merchantLoaded) {
    return <MerchantOnboarding userId={userId} onCreated={setMerchant} />;
  }
  const paidActive = Boolean(merchant?.subscription_ends_at && new Date(merchant.subscription_ends_at).getTime() > checkedAt);

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      {/* Header */}
      <header className="bg-emerald-600 text-white p-4 shadow-md">
        <h1 className="font-bold text-lg">Membresía y Plan</h1>
        <p className="text-xs text-emerald-100">{merchant?.business_name}</p>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {paymentNotice && <p role="status" className="text-sm text-slate-700 bg-white p-4 rounded-xl">{paymentNotice}</p>}
        <button type="button" onClick={() => void refreshPlan()} className="text-sm font-semibold text-emerald-700">Revisar mi plan</button>
        {/* Banner de Estado de Suscripción */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-2xl ${merchant?.subscription_status === "trial" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}
            >
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase">
                Estado Actual
              </p>
              <h2 className="text-base font-extrabold text-slate-800">
                {merchant?.subscription_status === "trial" &&
                  `Prueba Gratis (${daysLeft} días restantes)`}
                {paidActive && merchant?.subscription_status === "active_monthly" &&
                  "Plan Mensual Activo"}
                {paidActive && merchant?.subscription_status === "active_yearly" &&
                  "Plan Anual Activo"}
                {merchant?.subscription_status !== "trial" && !paidActive && "Sin plan pagado vigente"}
              </h2>
              {paidActive && <p className="text-xs text-slate-500">Vigente hasta {new Date(merchant!.subscription_ends_at!).toLocaleDateString("es-PE")}</p>}
            </div>
          </div>
        </div>

        {/* Opciones de Planes */}
        <div className="space-y-3">
          {/* Plan Mensual */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-bold text-slate-800">Plan Mensual</h3>
                <p className="text-xs text-slate-400">
                  Un mes de acceso. Sin cobros automáticos.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold text-emerald-600">
                  S/ 29.00
                </span>
                <span className="text-xs text-slate-400">/mes</span>
              </div>
            </div>

            <ul className="text-xs text-slate-600 space-y-1.5 my-4">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Registro
                ilimitado de ventas y gastos
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Cobro
                ilimitado por WhatsApp
              </li>
            </ul>

            <button
              onClick={() => handleSubscribe("monthly")}
              disabled={!!processingPlan || !merchant || !!paymentNotice}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {processingPlan === "monthly" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Pagar un mes con Mercado Pago</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Plan Anual (Ahorro) */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-md relative overflow-hidden border border-slate-700">
            <div className="absolute top-3 right-3 bg-emerald-500 text-slate-950 font-extrabold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide">
              Ahorra casi 20%
            </div>

            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-bold text-white">Plan Anual</h3>
                <p className="text-xs text-slate-300">
                  12 meses de acceso total
                </p>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold text-emerald-400">
                  S/ 279.00
                </span>
                <span className="text-xs text-slate-300">/año</span>
              </div>
            </div>

            <ul className="text-xs text-slate-300 space-y-1.5 my-4">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Todos los
                beneficios del Plan Mensual
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Sin
                renovación automática
              </li>
            </ul>

            <button
              onClick={() => handleSubscribe("yearly")}
              disabled={!!processingPlan || !merchant || !!paymentNotice}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {processingPlan === "yearly" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Obtener Plan Anual</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-slate-400 text-xs py-2">
          <ShieldCheck className="w-4 h-4 text-slate-500" />
          <span>Pagos procesados de forma segura con Mercado Pago</span>
        </div>

        <AvisoLibroReclamaciones />
      </main>
      <ErrorToast message={errorMsg} onClose={() => setErrorMsg(null)} />
    </div>
  );
}
