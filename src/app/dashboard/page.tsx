// app/dashboard/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  LogOut,
  Loader2,
  Store,
} from "lucide-react";
import { Merchant, PaymentMethod, Transaction } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import PaymentMethodsChart from "@/components/PaymentMethodsChart";
import { PieChart as PieIcon } from "lucide-react";

export default function DashboardPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados del Formulario
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"sale" | "expense">("sale");
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Efectivo");
  // Estado del filtro para la gráfica ('sale' o 'expense')
  const [chartType, setChartType] = useState<"sale" | "expense">("sale");

  const router = useRouter();
  const supabase = createClient();

  // Cargar datos de la bodega y transacciones del día
  useEffect(() => {
    async function loadData() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // 1. Obtener la bodega asociada al usuario
      const { data: merchantData, error: merchantError } = await supabase
        .from("merchants")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (merchantError || !merchantData) {
        router.push("/login");
        return;
      }

      setMerchant(merchantData);

      // 2. Obtener transacciones del día de hoy
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: txData } = await supabase
        .from("transactions")
        .select("*")
        .eq("merchant_id", merchantData.id)
        .gte("created_at", today.toISOString())
        .order("created_at", { ascending: false });

      if (txData) setTransactions(txData);
      setLoading(false);
    }

    loadData();
  }, [router, supabase]);

  // Registrar Venta o Gasto
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant || !amount) return;

    setSubmitting(true);
    const numAmount = parseFloat(amount);

    const { data: newTx, error } = await supabase
      .from("transactions")
      .insert([
        {
          merchant_id: merchant.id,
          type, // 'income' o 'expense'
          amount: numAmount,
          description,
          payment_method: paymentMethod, // <--- Guardamos el método seleccionado
        },
      ])
      .select()
      .single();

    if (!error && newTx) {
      setTransactions([newTx, ...transactions]);
      setAmount("");
      setDescription("");
    }

    setSubmitting(false);
  };

  // Cerrar Sesión
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Cálculos de métricas del día
  const totalIncome = transactions
    .filter((t) => t.type === "sale")
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const totalExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const balance = totalIncome - totalExpense;

  // Filtrar transacciones para la gráfica según la pestaña activa
  const chartTransactions = transactions.filter((t) => t.type === chartType);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Top Navbar */}
      <header className="bg-emerald-600 text-white p-4 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Store className="w-6 h-6 text-emerald-200" />
          <span className="font-bold text-lg">{merchant?.business_name}</span>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors"
          title="Cerrar Sesión"
        >
          <LogOut className="w-5 h-5 text-white" />
        </button>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {/* Tarjeta de Balance Diario */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
            <Wallet className="w-4 h-4 text-emerald-600" />
            <span>Ganancia Real de Hoy</span>
          </div>
          <div
            className={`text-3xl font-extrabold ${balance >= 0 ? "text-slate-800" : "text-red-600"}`}
          >
            {merchant?.currency} {balance.toFixed(2)}
          </div>

          {/* Desglose Ingresos / Gastos */}
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Ventas</p>
                <p className="text-sm font-bold text-slate-700">
                  +{merchant?.currency} {totalIncome.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="p-2 bg-rose-50 rounded-lg">
                <ArrowDownRight className="w-4 h-4 text-rose-600" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Gastos</p>
                <p className="text-sm font-bold text-slate-700">
                  -{merchant?.currency} {totalExpense.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Formulario de Registro Rápido */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <h2 className="text-sm font-bold text-slate-700 mb-3">
            Registro Rápido
          </h2>

          <form onSubmit={handleAddTransaction} className="space-y-3">
            {/* Selector de Tipo (+ Venta / - Gasto) */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setType("sale")}
                className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                  type === "sale"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Plus className="w-4 h-4" /> Venta
              </button>
              <button
                type="button"
                onClick={() => setType("expense")}
                className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                  type === "expense"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Minus className="w-4 h-4" /> Gasto
              </button>
            </div>

            {/* Input de Monto */}
            <div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-slate-400 text-sm">
                  {merchant?.currency}
                </span>
                <input
                  type="number"
                  step="0.10"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-base font-bold text-slate-800 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Input de Descripción Opcional */}
            <div>
              <input
                type="text"
                placeholder="Descripción (ej. Arroz, Aceite, Pago proveedor)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto py-1">
              {(["Efectivo", "Yape", "Plin", "Tarjeta"] as PaymentMethod[]).map(
                (method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                      paymentMethod === method
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {method}
                  </button>
                ),
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || !amount}
              className={`w-full py-3 font-bold text-white rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 ${
                type === "sale"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              } disabled:opacity-50`}
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span>Guardar {type === "sale" ? "Venta" : "Gasto"}</span>
              )}
            </button>
          </form>
        </div>

        {/* Movimientos Recientes del Día */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Movimientos de Hoy
          </h2>

          {transactions.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">
              Aún no hay registros hoy.
            </p>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-1.5 rounded-lg ${
                        tx.type === "sale"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {tx.type === "sale" ? (
                        <Plus className="w-4 h-4" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">
                        {tx.description ||
                          (tx.type === "sale"
                            ? "Venta rápida"
                            : "Gasto rápido")}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(tx.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-extrabold ${
                      tx.type === "sale"
                        ? "text-emerald-600"
                        : "text-rose-600"
                    }`}
                  >
                    {tx.type === "sale" ? "+" : "-"}
                    {merchant?.currency} {Number(tx.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Sección de la Gráfica de Métodos de Pago / Gastos */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Distribución por Métodos
              </h2>
            </div>

            {/* Toggle de Pestañas para la gráfica */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
              <button
                onClick={() => setChartType("sale")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  chartType === "sale"
                    ? "bg-white text-emerald-600 shadow-xs"
                    : "text-slate-400"
                }`}
              >
                Ventas
              </button>
              <button
                onClick={() => setChartType("expense")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  chartType === "expense"
                    ? "bg-white text-rose-600 shadow-xs"
                    : "text-slate-400"
                }`}
              >
                Gastos
              </button>
            </div>
          </div>

          {/* Gráfica Recharts */}
          <PaymentMethodsChart transactions={chartTransactions} />
        </div>
      </main>
    </div>
  );
}
