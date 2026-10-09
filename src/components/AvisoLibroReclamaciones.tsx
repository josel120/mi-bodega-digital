import Link from "next/link";
import { AVISO_LIBRO } from "@/content/legal/reclamaciones";

/**
 * Aviso del Libro de Reclamaciones. El texto vive en un solo lugar
 * (src/content/legal/reclamaciones.ts) porque lo fija Legal.
 */
export default function AvisoLibroReclamaciones({ className = "" }: { className?: string }) {
  return (
    <aside aria-label="Libro de Reclamaciones" className={`text-base text-slate-700 print:hidden ${className}`}>
      <p>{AVISO_LIBRO}</p>
      <Link
        href="/reclamaciones"
        className="inline-flex items-center min-h-11 font-semibold text-emerald-700 underline underline-offset-2"
      >
        Libro de Reclamaciones
      </Link>
    </aside>
  );
}
