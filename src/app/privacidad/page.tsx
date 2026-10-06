import type { Metadata } from "next";
import PaginaLegal from "@/components/PaginaLegal";
import * as doc from "@/content/legal/privacidad";

export const metadata: Metadata = { title: `${doc.TITULO} · Mi Bodega Digital` };

export default function PrivacidadPage() {
  return <PaginaLegal doc={doc} />;
}
