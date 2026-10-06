import type { Metadata } from "next";
import PaginaLegal from "@/components/PaginaLegal";
import * as doc from "@/content/legal/devoluciones";

export const metadata: Metadata = { title: `${doc.TITULO} · Mi Bodega Digital` };

export default function DevolucionesPage() {
  return <PaginaLegal doc={doc} />;
}
