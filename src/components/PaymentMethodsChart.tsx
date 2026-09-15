// components/PaymentMethodsChart.tsx
"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { Transaction } from "@/types/database";

const METHOD_COLORS: Record<string, string> = {
  Efectivo: "#10B981", // Verde Efectivo
  Yape: "#8B5CF6",     // Morado Yape
  Plin: "#06B6D4",     // Celeste Plin
  Tarjeta: "#F59E0B",  // Naranja Tarjeta
  Otro: "#64748B",     // Gris Otro
};

const FALLBACK_COLORS = ["#10B981", "#8B5CF6", "#06B6D4", "#F59E0B", "#64748B"];

export default function PaymentMethodsChart({
  transactions,
}: {
  transactions: Transaction[];
}) {
  // Agrupar totales por método de pago
  const totalsByMethod = transactions.reduce(
    (acc, curr) => {
      const method = curr.payment_method || "Efectivo";
      acc[method] = (acc[method] || 0) + Number(curr.amount);
      return acc;
    },
    {} as Record<string, number>,
  );

  const data = Object.keys(totalsByMethod).map((method) => ({
    name: method,
    value: totalsByMethod[method],
  }));

  const totalAmount = data.reduce((acc, curr) => acc + curr.value, 0);

  if (data.length === 0) {
    return (
      <p className="text-xs text-slate-400 text-center py-6">
        No hay transacciones registradas hoy.
      </p>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Gráfico Donut con Recharts */}
      <div className="w-full h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={68}
              paddingAngle={4}
              dataKey="value"
            >
              {data.map((entry, index) => {
                const color =
                  METHOD_COLORS[entry.name] ||
                  FALLBACK_COLORS[index % FALLBACK_COLORS.length];
                return <Cell key={`cell-${index}`} fill={color} />;
              })}
            </Pie>
            <Tooltip
              formatter={(
                value: number | string | readonly (string | number)[] | undefined,
              ) => [`S/ ${Number(value ?? 0).toFixed(2)}`, "Monto"]}
              contentStyle={{ borderRadius: "12px", fontSize: "12px" }}
            />
            <Legend
              formatter={(value: string) => {
                const item = data.find((d) => d.name === value);
                const amount = item ? `S/ ${item.value.toFixed(2)}` : "";
                return (
                  <span className="text-slate-700 font-semibold text-xs">
                    {value}: <strong className="text-slate-900">{amount}</strong>
                  </span>
                );
              }}
              wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Desglose visual detallado siempre visible */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
        {data.map((entry, index) => {
          const color =
            METHOD_COLORS[entry.name] ||
            FALLBACK_COLORS[index % FALLBACK_COLORS.length];
          const percent =
            totalAmount > 0
              ? Math.round((entry.value / totalAmount) * 100)
              : 0;

          return (
            <div
              key={entry.name}
              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs font-bold text-slate-700 truncate">
                  {entry.name}
                </span>
              </div>

              <div className="text-right shrink-0 ml-1">
                <p className="text-xs font-extrabold text-slate-900">
                  S/ {entry.value.toFixed(2)}
                </p>
                <p className="text-[10px] text-slate-400 font-semibold">
                  {percent}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
