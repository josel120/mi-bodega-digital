"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * Aviso de que algo NO se guardo.
 *
 * Antes, si el insert a Supabase fallaba (sin señal, sesion vencida), la app no
 * decia nada: el bodeguero tecleaba la venta, veia el formulario limpiarse y
 * daba por hecho que quedo anotada. Para un cuaderno de caja eso es peor que
 * un error a la vista.
 */
export default function ErrorToast({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onClose, 6000);
    return () => clearTimeout(id);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-20 left-0 right-0 z-[60] px-4 pointer-events-none"
    >
      <div className="max-w-md mx-auto bg-rose-600 text-white rounded-xl shadow-lg px-4 py-3 flex items-start gap-2 pointer-events-auto">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <p className="text-xs font-semibold leading-snug flex-1">{message}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="p-0.5 hover:bg-rose-500 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
