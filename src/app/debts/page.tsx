// app/debts/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import { Merchant, CustomerDebt } from "@/src/types/database";
import {
  UserPlus,
  Send,
  ArrowLeft,
  Phone,
  User,
  Plus,
  Minus,
  Loader2,
} from "lucide-react";

export default function DebtsPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [debts, setDebts] = useState<CustomerDebt[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados Formulario Nuevo Cliente / Deuda
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Estado Ajuste de Saldo (Modal o inline)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDebt | null>(
    null,
  );
  const [adjustAmount, setAdjustAmount] = useState("");

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // 1. Cargar Bodega
      const { data: merchantData } = await supabase
        .from("merchants")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!merchantData) {
        router.push("/login");
        return;
      }

      setMerchant(merchantData);

      // 2. Cargar lista de deudores
      const { data: debtsData } = await supabase
        .from("customers_debts")
        .select("*")
        .eq("merchant_id", merchantData.id)
        .order("updated_at", { ascending: false });

      if (debtsData) setDebts(debtsData);
      setLoading(false);
    }

    loadData();
  }, [router, supabase]);

  // Registrar Nuevo Cliente Deudor
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant || !customerName || !phoneNumber) return;

    setSubmitting(true);
    const balance = parseFloat(initialBalance) || 0;

    const { data: newDebt, error } = await supabase
      .from("customers_debts")
      .insert([
        {
          merchant_id: merchant.id,
          customer_name: customerName,
          phone_number: phoneNumber,
          balance,
        },
      ])
      .select()
      .single();

    if (!error && newDebt) {
      setDebts([newDebt, ...debts]);
      setCustomerName("");
      setPhoneNumber("");
      setInitialBalance("");
    }

    setSubmitting(false);
  };

  // Sumar o Abonar a la deuda de un cliente
  const handleUpdateBalance = async (
    customer: CustomerDebt,
    isAddition: boolean,
  ) => {
    if (!adjustAmount || isNaN(Number(adjustAmount))) return;

    const amount = parseFloat(adjustAmount);
    const newBalance = isAddition
      ? Number(customer.balance) + amount
      : Number(customer.balance) - amount;

    const { data: updated, error } = await supabase
      .from("customers_debts")
      .update({
        balance: Math.max(0, newBalance),
        updated_at: new Date().toISOString(),
      })
      .eq("id", customer.id)
      .select()
      .single();

    if (!error && updated) {
      setDebts(debts.map((d) => (d.id === customer.id ? updated : d)));
      setSelectedCustomer(null);
      setAdjustAmount("");
    }
  };

  // Formatear y Enviar mensaje por WhatsApp
  const handleSendWhatsApp = (customer: CustomerDebt) => {
    const yapeInfo = merchant?.yape_number
      ? ` Puedes yapear/plinear al ${merchant.yape_number}.`
      : "";
    const message = `Hola ${customer.customer_name}, te compartimos el resumen de tu cuenta en ${merchant?.business_name}. Saldo pendiente: S/ ${Number(customer.balance).toFixed(2)}.${yapeInfo} ¡Muchas gracias!`;

    // Limpiar el número de teléfono
    let cleanPhone = customer.phone_number.replace(/\D/g, "");
    if (!cleanPhone.startsWith("51") && cleanPhone.length === 9) {
      cleanPhone = `51${cleanPhone}`; // Añadir código de país Perú (+51)
    }

    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Header */}
      <header className="bg-emerald-600 text-white p-4 shadow-md flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard")}
          className="p-1.5 bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="font-bold text-lg leading-tight">Control de Fiados</h1>
          <p className="text-xs text-emerald-100">{merchant?.business_name}</p>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {/* Formulario de Nuevo Cliente */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-600" />
            <span>Registrar Nuevo Deudor</span>
          </h2>

          <form onSubmit={handleCreateCustomer} className="space-y-3">
            <div>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="Nombre del Cliente (Ej. Sra. María)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="tel"
                  required
                  placeholder="Celular (9 dígitos)"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <input
                  type="number"
                  step="0.10"
                  placeholder="Deuda inicial S/"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !customerName || !phoneNumber}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>Guardar Cliente</span>
              )}
            </button>
          </form>
        </div>

        {/* Listado de Clientes con Deudas */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Clientes con Saldo Pendiente ({debts.length})
          </h2>

          {debts.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">
              No tienes fiados registrados.
            </p>
          ) : (
            <div className="space-y-3">
              {debts.map((customer) => (
                <div
                  key={customer.id}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {customer.customer_name}
                      </p>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {customer.phone_number}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">
                        Deuda
                      </p>
                      <p className="text-base font-extrabold text-rose-600">
                        {merchant?.currency}{" "}
                        {Number(customer.balance).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex gap-2 pt-1 border-t border-slate-200/50">
                    <button
                      onClick={() =>
                        setSelectedCustomer(
                          selectedCustomer?.id === customer.id
                            ? null
                            : customer,
                        )
                      }
                      className="flex-1 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                    >
                      Ajustar Deuda
                    </button>

                    <button
                      onClick={() => handleSendWhatsApp(customer)}
                      disabled={Number(customer.balance) <= 0}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                    >
                      <Send className="w-3 h-3" /> Cobrar por WA
                    </button>
                  </div>

                  {/* Sub-formulario inline para Ajustar Deuda */}
                  {selectedCustomer?.id === customer.id && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 mt-2 space-y-2">
                      <p className="text-[11px] font-bold text-slate-600">
                        Abonar o sumar a la deuda:
                      </p>
                      <input
                        type="number"
                        step="0.10"
                        placeholder="Monto S/"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleUpdateBalance(customer, true)}
                          className="py-1.5 bg-rose-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Fió más (+S/)
                        </button>
                        <button
                          onClick={() => handleUpdateBalance(customer, false)}
                          className="py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1"
                        >
                          <Minus className="w-3 h-3" /> Abonó (-S/)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
