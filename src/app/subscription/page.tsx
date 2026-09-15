// app/subscription/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Merchant } from "@/types/database";
import { MOSTRAR_PLANES } from "@/lib/features";
import { sesionLocal } from "@/lib/merchant";
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

      const { data: merchantData } = await supabase
        .from("merchants")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (merchantData) setMerchant(merchantData);
      setLoading(false);
    }

    loadData();
  }, [router, supabase]);

  // Manejar redirección al Checkout / Preference de Mercado Pago
  const handleSubscribe = async (planType: "monthly" | "yearly") => {
    setProcessingPlan(planType);

    try {
      // Petición a la API Route que crearemos para generar la preferencia de Mercado Pago
      const response = await fetch("/api/mercadopago/create-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: merchant?.id,
          planType,
        }),
      });

      const data = await response.json();

      if (data.init_point) {
        // Redirigir al Checkout de Mercado Pago
        window.location.href = data.init_point;
      } else {
        alert("Ocurrió un error al generar la orden de pago.");
      }
    } catch (error) {
      console.error(error);
      alert("Error de conexión al procesar el pago.");
    } finally {
      setProcessingPlan(null);
    }
  };

  // Cálculo de días restantes de prueba
  const getDaysLeft = () => {
    if (!merchant?.trial_ends_at) return 0;
    const diffTime =
      new Date(merchant.trial_ends_at).getTime() - new Date().getTime();
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

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      {/* Header */}
      <header className="bg-emerald-600 text-white p-4 shadow-md">
        <h1 className="font-bold text-lg">Membresía y Plan</h1>
        <p className="text-xs text-emerald-100">{merchant?.business_name}</p>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
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
                {merchant?.subscription_status === "active_monthly" &&
                  "Plan Mensual Activo"}
                {merchant?.subscription_status === "active_yearly" &&
                  "Plan Anual Activo"}
              </h2>
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
                  Sin permanencia, cancela cuando quieras
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
              disabled={!!processingPlan}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {processingPlan === "monthly" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Pagar con Mercado Pago / Yape</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {/* Plan Anual (Ahorro) */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-md relative overflow-hidden border border-slate-700">
            <div className="absolute top-3 right-3 bg-emerald-500 text-slate-950 font-extrabold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide">
              Ahorra 20%
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
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Soporte
                prioritario
              </li>
            </ul>

            <button
              onClick={() => handleSubscribe("yearly")}
              disabled={!!processingPlan}
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
      </main>
    </div>
  );
}
