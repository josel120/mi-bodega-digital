import type { Metadata } from "next";
import PaginaLegal from "@/components/PaginaLegal";
import FormularioReclamo from "@/components/FormularioReclamo";
import * as doc from "@/content/legal/reclamaciones";

export const metadata: Metadata = { title: `${doc.TITULO} · Mi Bodega Digital` };

// Pública: quien reclama puede no tener cuenta. La hoja se guarda con la RPC
// `registrar_reclamo` (supabase/03-legal-y-cuenta.sql), que no deja leer nada.
export default function ReclamacionesPage() {
  return (
    <PaginaLegal doc={{ TITULO: doc.TITULO, ACTUALIZADO: doc.ACTUALIZADO, SECCIONES: doc.SECCIONES }}>
      <FormularioReclamo campos={doc.CAMPOS} />
    </PaginaLegal>
  );
}
