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
import { Transaction } from "../types/database";

const COLORS = ["#10B981", "#8B5CF6", "#06B6D4", "#F59E0B", "#64748B"];
// Verde (Efectivo), Morado (Yape), Cyan (Plin), Naranja (Tarjeta), Gris (Otro)

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

  if (data.length === 0) {
    return (
      <p className="text-xs text-slate-400 text-center py-6">
        No hay transacciones registradas hoy.
      </p>
    );
  }

  return (
    <div className="w-full h-52">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={70}
            paddingAngle={4}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`S/ ${value.toFixed(2)}`, "Monto"]}
            contentStyle={{ borderRadius: "12px", fontSize: "12px" }}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
