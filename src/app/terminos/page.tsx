import type { Metadata } from "next";
import PaginaLegal from "@/components/PaginaLegal";
import * as doc from "@/content/legal/terminos";

export const metadata: Metadata = { title: `${doc.TITULO} · Mi Bodega Digital` };

export default function TerminosPage() {
  return <PaginaLegal doc={doc} />;
}
