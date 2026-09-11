// components/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CreditCard } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  // Si estamos en la pantalla de Login, no mostramos la barra de navegación
  if (pathname === "/login" || pathname === "/login/") return null;

  const navItems = [
    {
      label: "Caja Diaria",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Fiados",
      href: "/debts",
      icon: Users,
    },
    {
      label: "Plan",
      href: "/subscription",
      icon: CreditCard,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200/80 shadow-lg md:hidden">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            pathname === `${item.href}/` ||
            pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive
                  ? "text-emerald-600 font-bold"
                  : "text-slate-400 hover:text-slate-600 font-medium"
              }`}
            >
              <div
                className={`p-1 rounded-xl transition-all ${
                  isActive ? "bg-emerald-50 text-emerald-600" : ""
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
