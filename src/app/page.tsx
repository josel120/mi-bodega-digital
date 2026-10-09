"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AvisoLibroReclamaciones from "@/components/AvisoLibroReclamaciones";
import { Loader2 } from "lucide-react";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      <p className="text-xs text-slate-500 font-medium">
        Cargando Mi Bodega Digital...
      </p>
      <AvisoLibroReclamaciones className="mt-6 mx-4 max-w-md" />
    </div>
  );
}

