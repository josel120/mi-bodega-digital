// app/dashboard/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
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
  Calendar,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
  PieChart as PieIcon,
  WifiOff,
} from "lucide-react";
import {
  Merchant,
  PaymentMethod,
  Transaction,
  TransactionType,
} from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import PaymentMethodsChart from "@/components/PaymentMethodsChart";
import MerchantOnboarding from "@/components/MerchantOnboarding";
import {
  loadMerchant,
  sesionLocal,
  leerBodegaGuardada,
  guardarBodega,
  olvidarBodega,
} from "@/lib/merchant";
import ErrorToast from "@/components/ErrorToast";
import { parseAmount } from "@/lib/money";

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateStr: string): string {
  const todayStr = getLocalDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  if (dateStr === todayStr) return "Hoy";
  if (dateStr === yesterdayStr) return "Ayer";

  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function DashboardPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingTx, setFetchingTx] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sinSenal, setSinSenal] = useState(false);

  // Fecha seleccionada
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());

  // Estados del Formulario de Creación
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TransactionType>("income");
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Efectivo");

  // Estado del filtro para la gráfica ('income' o 'expense')
  const [chartType, setChartType] = useState<TransactionType>("income");

  // Estados para Edición
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editType, setEditType] = useState<TransactionType>("income");
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>("Efectivo");

  // Estado para Eliminación
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  const router = useRouter();
  const supabase = createClient();

  // Consulta los movimientos de un día. Devuelve los datos en vez de escribir
  // el estado para que quien llama pueda descartar una respuesta vieja.
  const fetchTransactionsForDate = useCallback(
    async (merchantId: string, dateStr: string) => {
      const [y, m, d] = dateStr.split("-").map(Number);
      const startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0);
      const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("merchant_id", merchantId)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString())
        .order("created_at", { ascending: false });

      if (error) return { rows: null, error: error.message };
      return { rows: (data ?? []) as Transaction[], error: null };
    },
    [supabase],
  );

  // 1) Sesion y bodega. Corre una sola vez: antes esto se repetia cada vez que
  //    el bodeguero cambiaba de dia y volvia a pedir la bodega sin necesidad.
  useEffect(() => {
    async function loadData() {
      // Sesión leída del teléfono, no de la red: en modo avión `getUser()`
      // devolvía usuario nulo y echábamos a /login a alguien que lleva meses
      // logueado. Ver src/lib/merchant.ts.
      const user = await sesionLocal(supabase);

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);
      const { merchant: found, error } = await loadMerchant(supabase, user.id);

      if (found) {
        guardarBodega(found);
        setMerchant(found);
        setLoading(false);
        return;
      }

      // No llegamos a Supabase. Abrimos con la última bodega conocida para
      // que al menos vea su caja, y lo decimos claro en pantalla.
      if (error) {
        const guardada = leerBodegaGuardada(user.id);
        setSinSenal(true);
        if (guardada) setMerchant(guardada);
        setLoading(false);
        return;
      }

      // Sin bodega no lo echamos a /login: desde ahí volvería a entrar y a
      // rebotar para siempre. Le pedimos el nombre y sigue trabajando.
      setNeedsOnboarding(true);
      setLoading(false);
    }

    loadData();
  }, [router, supabase]);

  // 2) Movimientos del día elegido. El flag `vigente` descarta las respuestas
  //    que llegan tarde: tocando rápido las flechas, la consulta de un día
  //    anterior podía aterrizar al final y mostrar la caja del día equivocado.
  useEffect(() => {
    const merchantId = merchant?.id;
    if (!merchantId) return;

    let vigente = true;

    async function cargar() {
      setFetchingTx(true);
      const { rows, error } = await fetchTransactionsForDate(
        merchantId!,
        selectedDate,
      );
      if (!vigente) return;

      if (error || !rows) {
        setSinSenal(true);
      } else {
        setSinSenal(false);
        setTransactions(rows);
      }
      setFetchingTx(false);
    }

    cargar();

    return () => {
      vigente = false;
    };
  }, [merchant?.id, selectedDate, fetchTransactionsForDate]);

  // Manejar cambio de fecha con flechas
  const handleShiftDate = (days: number) => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const target = new Date(y, m - 1, d + days);
    setSelectedDate(getLocalDateString(target));
  };

  // Registrar Venta o Gasto
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant) return;

    const numAmount = parseAmount(amount);
    if (numAmount === null) {
      setErrorMsg("Escribe un monto mayor a cero, por ejemplo 12.50");
      return;
    }

    setSubmitting(true);

    // Si está viendo hoy, usar hora actual; si está viendo otra fecha, asociar a ese día
    const isToday = selectedDate === getLocalDateString();
    let createdAtISO = new Date().toISOString();
    if (!isToday) {
      const [y, m, d] = selectedDate.split("-").map(Number);
      const now = new Date();
      const customDate = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
      createdAtISO = customDate.toISOString();
    }

    const { data: newTx, error } = await supabase
      .from("transactions")
      .insert([
        {
          merchant_id: merchant.id,
          type,
          amount: numAmount,
          description,
          payment_method: paymentMethod,
          created_at: createdAtISO,
        },
      ])
      .select()
      .single();

    if (error || !newTx) {
      // Nunca vaciamos el formulario si no se guardo: el bodeguero tiene que
      // poder reintentar sin volver a teclear el monto.
      setErrorMsg(
        "No se pudo anotar el movimiento. Revisa tu señal e intenta de nuevo.",
      );
    } else {
      setTransactions([newTx, ...transactions]);
      setAmount("");
      setDescription("");
    }

    setSubmitting(false);
  };

  // Iniciar edición de una transacción
  const handleStartEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditAmount(String(tx.amount));
    setEditDescription(tx.description || "");
    setEditType(tx.type === "expense" ? "expense" : "income");
    setEditPaymentMethod(tx.payment_method || "Efectivo");
  };

  // Guardar cambios de edición
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;

    const numAmount = parseAmount(editAmount);
    if (numAmount === null) {
      setErrorMsg("Escribe un monto mayor a cero, por ejemplo 12.50");
      return;
    }

    setSubmitting(true);

    const { data: updatedTx, error } = await supabase
      .from("transactions")
      .update({
        type: editType,
        amount: numAmount,
        description: editDescription,
        payment_method: editPaymentMethod,
      })
      .eq("id", editingTx.id)
      .select()
      .single();

    if (error || !updatedTx) {
      setErrorMsg(
        "No se pudo guardar el cambio. Revisa tu señal e intenta de nuevo.",
      );
    } else {
      setTransactions((prev) =>
        prev.map((t) => (t.id === editingTx.id ? updatedTx : t)),
      );
      setEditingTx(null);
    }

    setSubmitting(false);
  };

  // Confirmar y eliminar transacción
  const handleConfirmDelete = async () => {
    if (!deletingTx) return;

    setSubmitting(true);
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", deletingTx.id);

    if (error) {
      setErrorMsg(
        "No se pudo borrar el movimiento. Revisa tu señal e intenta de nuevo.",
      );
    } else {
      setTransactions((prev) => prev.filter((t) => t.id !== deletingTx.id));
      setDeletingTx(null);
    }

    setSubmitting(false);
  };

  // Cerrar Sesión
  const handleLogout = async () => {
    olvidarBodega();
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Helper para identificar ventas (income o legacy sale)
  const isIncome = (t: Transaction) => t.type === "income" || t.type === "sale";

  // Cálculos de métricas del día seleccionado
  const totalIncome = transactions
    .filter(isIncome)
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const totalExpense = transactions
    .filter((t) => t.type === "expense")
    .reduce((acc, t) => acc + Number(t.amount), 0);

  const balance = totalIncome - totalExpense;

  // Filtrar transacciones para la gráfica según la pestaña activa
  const chartTransactions = transactions.filter((t) =>
    chartType === "income" ? isIncome(t) : t.type === "expense",
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (needsOnboarding && userId) {
    return (
      <MerchantOnboarding
        userId={userId}
        onCreated={(created) => {
          setMerchant(created);
          setNeedsOnboarding(false);
        }}
      />
    );
  }

  const isToday = selectedDate === getLocalDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterday);

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
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
        {sinSenal && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2">
            <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-amber-800 leading-snug">
              Sin señal. Esta es tu bodega guardada en el teléfono. Los
              movimientos del día y lo que anotes ahora necesitan internet.
            </p>
          </div>
        )}
        {/* Selector de Fecha */}
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-200/60 flex items-center justify-between gap-2">
          <button
            onClick={() => handleShiftDate(-1)}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
            title="Día anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            {/* Botón rápido Hoy */}
            <button
              onClick={() => setSelectedDate(getLocalDateString())}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                isToday
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Hoy
            </button>

            {/* Botón rápido Ayer */}
            <button
              onClick={() => setSelectedDate(yesterdayStr)}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                selectedDate === yesterdayStr
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Ayer
            </button>

            {/* Input de Fecha Nativo Estilizado */}
            <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 hover:bg-slate-100 transition-colors cursor-pointer">
              <Calendar className="w-4 h-4 text-emerald-600 mr-1.5 shrink-0" />
              <span className="text-xs font-bold text-slate-700">
                {formatDateLabel(selectedDate)}
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
          </div>

          <button
            onClick={() => handleShiftDate(1)}
            disabled={isToday}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            title="Día siguiente"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Tarjeta de Balance del Día */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60 relative">
          {fetchingTx && (
            <div className="absolute top-4 right-4">
              <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
            </div>
          )}
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
            <Wallet className="w-4 h-4 text-emerald-600" />
            <span>Ganancia Real ({formatDateLabel(selectedDate)})</span>
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700">
              Registrar Movimiento
            </h2>
            {!isToday && (
              <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg">
                Registrando en: {formatDateLabel(selectedDate)}
              </span>
            )}
          </div>

          <form onSubmit={handleAddTransaction} className="space-y-3">
            {/* Selector de Tipo (+ Venta / - Gasto) */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setType("income")}
                className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                  type === "income"
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
                  type="text"
                  inputMode="decimal"
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
                placeholder="Descripción (ej. Gaseosa, Pan, Pago proveedor)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Selector de Método de Pago */}
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
                type === "income"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              } disabled:opacity-50`}
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span>Guardar {type === "income" ? "Venta" : "Gasto"}</span>
              )}
            </button>
          </form>
        </div>

        {/* Movimientos del Día */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/60">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Movimientos ({transactions.length})
            </h2>
            <span className="text-[11px] text-slate-400 font-medium">
              {formatDateLabel(selectedDate)}
            </span>
          </div>

          {transactions.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">
              No hay registros para este día.
            </p>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        isIncome(tx)
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {isIncome(tx) ? (
                        <Plus className="w-4 h-4" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-700 truncate">
                        {tx.description ||
                          (isIncome(tx) ? "Venta rápida" : "Gasto rápido")}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span>
                          {new Date(tx.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="inline-block w-1 h-1 rounded-full bg-slate-300" />
                        <span className="font-semibold text-slate-500">
                          {tx.payment_method || "Efectivo"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span
                      className={`text-xs font-extrabold ${
                        isIncome(tx)
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    >
                      {isIncome(tx) ? "+" : "-"}
                      {merchant?.currency} {Number(tx.amount).toFixed(2)}
                    </span>

                    {/* Botón Editar */}
                    <button
                      onClick={() => handleStartEdit(tx)}
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Editar movimiento"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {/* Botón Eliminar */}
                    <button
                      onClick={() => setDeletingTx(tx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Eliminar movimiento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
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
                onClick={() => setChartType("income")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  chartType === "income"
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

      {/* MODAL DE EDICIÓN */}
      {editingTx && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                Editar Movimiento
              </h3>
              <button
                onClick={() => setEditingTx(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              {/* Selector de Tipo */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEditType("income")}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                    editType === "income"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  Venta
                </button>
                <button
                  type="button"
                  onClick={() => setEditType("expense")}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                    editType === "expense"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  Gasto
                </button>
              </div>

              {/* Monto */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Monto ({merchant?.currency})
                </label>
                <input
                  type="number"
                  step="0.10"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-3 py-2 text-base font-bold text-slate-800 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Detalle de la venta o gasto"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Método de Pago */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Método de Pago
                </label>
                <div className="flex gap-1.5 overflow-x-auto py-1">
                  {(["Efectivo", "Yape", "Plin", "Tarjeta"] as PaymentMethod[]).map(
                    (method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setEditPaymentMethod(method)}
                        className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                          editPaymentMethod === method
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {method}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || !editAmount}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Guardar Cambios"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {deletingTx && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl border border-slate-100 space-y-3 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-sm font-bold text-slate-800">
              ¿Eliminar este movimiento?
            </h3>

            <p className="text-xs text-slate-500">
              Vas a eliminar{" "}
              <strong className="text-slate-700">
                {isIncome(deletingTx) ? "Venta" : "Gasto"} de{" "}
                {merchant?.currency} {Number(deletingTx.amount).toFixed(2)}
              </strong>
              {deletingTx.description ? ` (${deletingTx.description})` : ""}. Esta
              acción no se puede deshacer.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTx(null)}
                disabled={submitting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={submitting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Sí, Eliminar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ErrorToast message={errorMsg} onClose={() => setErrorMsg(null)} />
    </div>
  );
}

