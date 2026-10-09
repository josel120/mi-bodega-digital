import { CORREO_CONTACTO, URL_TU_LIBRO } from "@/content/legal/reclamaciones";

/** Se muestra cuando la hoja no se pudo enviar: hay otra forma de reclamar. */
export default function CanalAlternativoReclamo() {
  return (
    <section role="note" aria-label="Otra forma de reclamar" className="p-4 text-base bg-amber-50 border border-amber-200 text-amber-900 rounded-xl">
      <p className="font-bold">No pudimos enviar tu hoja. Puedes reclamar por otro canal.</p>
      <p className="mt-2">Lo que escribiste sigue en el formulario: no lo borres ni cierres la página, y copia tu texto por si acaso.</p>
      <ul className="mt-2 space-y-1 list-disc pl-5">
        <li>Escríbenos a {CORREO_CONTACTO}.</li>
        <li>
          Usa el libro virtual de Indecopi:{" "}
          <a href={URL_TU_LIBRO} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
            Tu Libro (Indecopi)
          </a>
          .
        </li>
      </ul>
    </section>
  );
}
