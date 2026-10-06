import Link from "next/link";
import type { ReactNode } from "react";
import { Store } from "lucide-react";

export interface DocumentoLegal {
  TITULO: string;
  ACTUALIZADO: string;
  SECCIONES: { titulo: string; parrafos: string[] }[];
}

export const ENLACES_LEGALES = [
  { href: "/terminos", etiqueta: "Términos y condiciones" },
  { href: "/privacidad", etiqueta: "Aviso de privacidad" },
  { href: "/devoluciones", etiqueta: "Devoluciones" },
  { href: "/reclamaciones", etiqueta: "Libro de Reclamaciones" },
] as const;

// Los borradores de Legal llevan datos pendientes entre corchetes, por ejemplo
// [RUC]. Si alguno se publica así, que se vea que el texto no está terminado en
// vez de parecer un documento firmado.
const PENDIENTE = /\[[A-ZÁÉÍÓÚÑ0-9 ]{2,}\]/;

export function tienePendientes(doc: DocumentoLegal): boolean {
  return doc.SECCIONES.some((s) => s.parrafos.some((p) => PENDIENTE.test(p)));
}

function fechaLarga(iso: string): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  if (!anio || !mes || !dia) return iso;
  return new Date(Date.UTC(anio, mes - 1, dia)).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Página pública de un documento legal. Se lee sin iniciar sesión.
 * Letra de 16 px o más y una sola columna: se lee en un Android de 360 px.
 */
export default function PaginaLegal({
  doc,
  children,
}: {
  doc: DocumentoLegal;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-24">
      <header className="bg-emerald-600 text-white px-4 py-3 print:hidden">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 min-h-11 text-base font-bold"
        >
          <Store className="w-6 h-6 text-emerald-200" aria-hidden="true" />
          Mi Bodega Digital
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900 leading-tight">
          {doc.TITULO}
        </h1>
        <p className="text-base text-slate-600 mt-1">
          Actualizado el {fechaLarga(doc.ACTUALIZADO)}
        </p>

        {tienePendientes(doc) && (
          <p
            role="note"
            className="mt-4 p-3 text-base bg-amber-50 border border-amber-200 text-amber-900 rounded-xl"
          >
            Este documento está en revisión. Los datos entre corchetes se
            completan antes de empezar a cobrar.
          </p>
        )}

        {doc.SECCIONES.map((seccion) => (
          <section key={seccion.titulo} className="mt-6">
            <h2 className="text-lg font-bold text-slate-900">{seccion.titulo}</h2>
            {seccion.parrafos.map((parrafo, i) => (
              <p key={i} className="text-base leading-relaxed mt-2">
                {parrafo}
              </p>
            ))}
          </section>
        ))}

        {children}

        <nav
          aria-label="Documentos legales"
          className="mt-10 pt-4 border-t border-slate-200 print:hidden"
        >
          <ul className="space-y-1">
            {ENLACES_LEGALES.map((enlace) => (
              <li key={enlace.href}>
                <Link
                  href={enlace.href}
                  className="inline-flex items-center min-h-11 text-base font-semibold text-emerald-700 underline underline-offset-2"
                >
                  {enlace.etiqueta}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}
