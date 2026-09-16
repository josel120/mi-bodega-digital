// app/debts/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Merchant, CustomerDebt } from "@/types/database";
import {
  loadMerchant,
  sesionLocal,
  leerBodegaGuardada,
  guardarBodega,
} from "@/lib/merchant";
import MerchantOnboarding from "@/components/MerchantOnboarding";
import ErrorToast from "@/components/ErrorToast";
import EstadoConexion from "@/components/EstadoConexion";
import { parseAmount, parseMoney } from "@/lib/money";
import { anotar, armarPendiente, filaDeFiado } from "@/lib/offline/cola";
import { guardarFiados, leerFiados } from "@/lib/offline/almacen";
import { fiadosConPendientes } from "@/lib/offline/vista";
import { useCola } from "@/lib/offline/useCola";
import { nuevoId } from "@/lib/offline/id";
import type { FiadoLocal } from "@/lib/offline/tipos";
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
  // Igual que en la caja: acá solo va lo que dijo el servidor. Lo anotado sin
  // señal se pinta encima desde la cola.
  const [delServidor, setDelServidor] = useState<CustomerDebt[]>([]);
  const [guardadoEl, setGuardadoEl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sinSenal, setSinSenal] = useState(false);
  const [recarga, setRecarga] = useState(0);

  // Estados Formulario Nuevo Cliente / Deuda
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [initialBalance, setInitialBalance] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Estado Ajuste de Saldo (Modal o inline)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [adjustAmount, setAdjustAmount] = useState("");

  const router = useRouter();
  const supabase = createClient();

  const {
    cola,
    porSubir,
    trabados,
    sincronizando,
    sesionCaida,
    subidasHechas,
    sincronizarAhora,
    descartar,
    reintentar,
  } = useCola(supabase, merchant?.id ?? null);

  const mandarAhora = async () => {
    const resultado = await sincronizarAhora();
    if (resultado?.sinSenal) {
      setErrorMsg(
        "Todavía no hay internet. Lo que anotaste sigue guardado en el teléfono y se manda solo cuando vuelva.",
      );
    }
  };

  const reintentarUno = async (seq: number) => {
    const resultado = await reintentar(seq);
    if (resultado?.sinSenal) {
      setErrorMsg(
        "Todavía no hay internet. Lo dejamos guardado y se reintenta solo.",
      );
    }
  };

  // 1) Sesión y bodega.
  useEffect(() => {
    async function loadData() {
      // Sesión del teléfono, sin salir a la red. Ver src/lib/merchant.ts.
      const user = await sesionLocal(supabase);

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);

      // Sin .single(): ver src/lib/merchant.ts, rompía la cuenta cuando
      // faltaba la bodega o había dos.
      const { merchant: merchantData, error } = await loadMerchant(
        supabase,
        user.id,
      );

      if (merchantData) {
        guardarBodega(merchantData);
        setMerchant(merchantData);
        // `loading` lo apaga el efecto de la lista: si no, se ve un "no tienes
        // fiados" de medio segundo que asusta.
        return;
      }

      // No llegamos a Supabase. Antes esto caía en `needsOnboarding` y sin
      // señal la pantalla de fiados le pedía crear la bodega otra vez a alguien
      // que ya la tiene.
      if (error) {
        setSinSenal(true);
        const guardada = leerBodegaGuardada(user.id);
        if (guardada) setMerchant(guardada);
        setLoading(false);
        return;
      }

      setNeedsOnboarding(true);
      setLoading(false);
    }

    loadData();
  }, [router, supabase]);

  // 2) Lista de deudores. Si el servidor no contesta, la última que se bajó.
  useEffect(() => {
    const merchantId = merchant?.id;
    if (!merchantId) return;

    let vigente = true;

    async function cargar() {
      // Primero la lista guardada en el teléfono, que se pinta al instante.
      const guardado = await leerFiados(merchantId!);
      if (!vigente) return;
      setDelServidor(guardado.filas);
      setGuardadoEl(guardado.bajadoEl);
      // Si no hay nada guardado seguimos en "cargando": mostrar "no tienes
      // fiados" y que medio segundo después aparezcan cinco es peor que esperar.
      if (guardado.filas.length > 0) setLoading(false);

      // Igual que en la caja: sin red, `select` tarda siete segundos en
      // rendirse. El aviso tiene que salir antes que eso.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setSinSenal(true);
      }

      const { data, error } = await supabase
        .from("customers_debts")
        .select("*")
        .eq("merchant_id", merchantId!)
        .order("updated_at", { ascending: false });

      if (!vigente) return;

      if (!error && data) {
        setSinSenal(false);
        setDelServidor(data as CustomerDebt[]);
        setGuardadoEl(new Date().toISOString());
        await guardarFiados(merchantId!, data as CustomerDebt[]);
      } else {
        setSinSenal(true);
      }

      setLoading(false);
    }

    cargar();

    return () => {
      vigente = false;
    };
  }, [merchant?.id, recarga, subidasHechas, supabase]);

  const debts = useMemo(
    () => fiadosConPendientes(delServidor, cola),
    [delServidor, cola],
  );

  // Registrar Nuevo Cliente Deudor
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchant || !customerName || !phoneNumber) return;

    const balance = parseMoney(initialBalance) ?? 0;
    if (balance < 0) {
      setErrorMsg("La deuda inicial no puede ser negativa.");
      return;
    }

    setSubmitting(true);

    // El id lo decide el teléfono: si la subida se reintenta, el segundo INSERT
    // choca con la llave primaria y no se crea el cliente dos veces.
    const fila = filaDeFiado(
      nuevoId(),
      merchant.id,
      customerName,
      phoneNumber,
      balance,
    );

    const resultado = await anotar(
      supabase,
      armarPendiente(merchant.id, nuevoId(), { tipo: "crear_fiado", fila }),
    );

    if (!resultado.ok) {
      setErrorMsg(
        resultado.mensaje ??
          "No se pudo guardar el cliente. Revisa tu señal e intenta de nuevo.",
      );
    } else {
      setCustomerName("");
      setPhoneNumber("");
      setInitialBalance("");
      if (!resultado.enCola) setRecarga((n) => n + 1);
    }

    setSubmitting(false);
  };

  /**
   * Sumar o Abonar a la deuda de un cliente.
   *
   * Se guarda la DIFERENCIA, no el saldo final. Si esto espera señal un rato y
   * mientras tanto alguien cobró desde otro celular, el servidor suma la
   * diferencia sobre lo que tenga en ese momento en vez de pisarlo con un total
   * calculado con datos viejos. Ver src/lib/offline/cola.ts.
   */
  const handleUpdateBalance = async (
    customer: FiadoLocal,
    isAddition: boolean,
  ) => {
    if (!merchant) return;

    const amount = parseAmount(adjustAmount);
    if (amount === null) {
      setErrorMsg("Escribe un monto mayor a cero, por ejemplo 12.50");
      return;
    }

    const saldoActual = Number(customer.balance);
    if (!isAddition && amount > saldoActual) {
      // Antes el exceso se recortaba con Math.max(0, ...) sin decir nada y el
      // vuelto quedaba solo en la cabeza del bodeguero.
      setErrorMsg(
        `${customer.customer_name} solo debe S/ ${saldoActual.toFixed(2)}. Anota ese monto y dale su vuelto.`,
      );
      return;
    }

    setSubmitting(true);

    const resultado = await anotar(
      supabase,
      armarPendiente(merchant.id, nuevoId(), {
        tipo: "ajustar_fiado",
        debtId: customer.id,
        delta: isAddition ? amount : -amount,
        nombre: customer.customer_name,
      }),
    );

    if (!resultado.ok) {
      setErrorMsg(
        resultado.mensaje ??
          "No se pudo actualizar la deuda. Revisa tu señal e intenta de nuevo.",
      );
    } else {
      setSelectedCustomerId(null);
      setAdjustAmount("");
      if (!resultado.enCola) setRecarga((n) => n + 1);
    }

    setSubmitting(false);
  };

  // Formatear y Enviar mensaje por WhatsApp
  const handleSendWhatsApp = (customer: FiadoLocal) => {
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

  if (needsOnboarding && userId) {
    return (
      <MerchantOnboarding
        userId={userId}
        onCreated={(created) => {
          guardarBodega(created);
          setMerchant(created);
          setNeedsOnboarding(false);
        }}
      />
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
        <EstadoConexion
          sinSenal={sinSenal}
          sesionCaida={sesionCaida}
          guardadoEl={guardadoEl}
          porMandar={porSubir.length}
          trabados={trabados}
          sincronizando={sincronizando}
          onMandar={() => void mandarAhora()}
          onVolverAEntrar={() => router.push("/login")}
          onReintentar={(seq) => void reintentarUno(seq)}
          onDescartar={(seq) => void descartar(seq)}
        />

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
                  type="text"
                  inputMode="decimal"
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
            /* Sin nada guardado no podemos decir que no tenga fiados: no lo
               sabemos. Es plata que le deben. */
            <p className="text-sm text-slate-600 text-center py-4 px-2 leading-snug">
              {sinSenal && !guardadoEl
                ? "Sin señal, y la lista de fiados no está guardada en este teléfono. Necesitas internet para verla."
                : "No tienes fiados registrados."}
            </p>
          ) : (
            <div className="space-y-3">
              {debts.map((customer) => (
                <div
                  key={customer.id}
                  className={`p-3.5 rounded-xl border space-y-2 ${
                    customer.trabado
                      ? "bg-rose-50 border-rose-200"
                      : customer.pendiente
                        ? "bg-amber-50 border-amber-200"
                        : "bg-slate-50 border-slate-200/80"
                  }`}
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

                  {/* Que nunca quede duda de qué cifra es la del servidor. */}
                  {customer.pendiente && (
                    <p
                      className={`text-xs font-bold ${customer.trabado ? "text-rose-800" : "text-amber-800"}`}
                    >
                      {customer.trabado
                        ? "Algo de este cliente no se pudo mandar. Mira el aviso rojo de arriba."
                        : `Este saldo incluye ${customer.sinSubir === 1 ? "1 anotación que falta" : `${customer.sinSubir} anotaciones que faltan`} mandar.`}
                    </p>
                  )}

                  {/* Acciones */}
                  <div className="flex gap-2 pt-1 border-t border-slate-200/50">
                    <button
                      onClick={() =>
                        setSelectedCustomerId(
                          selectedCustomerId === customer.id
                            ? null
                            : customer.id,
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
                  {selectedCustomerId === customer.id && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 mt-2 space-y-2">
                      <p className="text-[11px] font-bold text-slate-600">
                        Abonar o sumar a la deuda:
                      </p>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Monto S/"
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleUpdateBalance(customer, true)}
                          className="py-1.5 bg-rose-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          <Plus className="w-3 h-3" /> Fió más (+S/)
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => handleUpdateBalance(customer, false)}
                          className="py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1 disabled:opacity-50"
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

      <ErrorToast message={errorMsg} onClose={() => setErrorMsg(null)} />
    </div>
  );
}
