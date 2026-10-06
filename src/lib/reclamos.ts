// Validación del Libro de Reclamaciones en el navegador.
//
// Es cortesía: la que vale es la de `registrar_reclamo` en
// supabase/03-legal-y-cuenta.sql, que repite estas reglas. Acá sirve para
// decirle a la persona qué le falta ANTES de mandar, campo por campo, y para
// mandar los montos y fechas ya normalizados.
import { parseMoney } from "@/lib/money";

export type TipoCampo =
  | "texto"
  | "email"
  | "telefono"
  | "numero"
  | "fecha"
  | "opcion"
  | "area";

export interface CampoReclamo {
  nombre: string;
  etiqueta: string;
  obligatorio: boolean;
  tipo: TipoCampo;
  opciones?: string[];
}

/**
 * Campos que solo aparecen (y se vuelven obligatorios) con cierta respuesta.
 * El formato oficial pide los datos del padre, madre o apoderado solo si quien
 * reclama es menor de edad. La base exige lo mismo.
 */
export const CONDICIONALES: Record<string, { campo: string; valor: string }> = {
  guardianName: { campo: "isMinor", valor: "Sí" },
  guardianContact: { campo: "isMinor", valor: "Sí" },
};

/** Largo máximo por campo. Igual o menor que el tope de la base (3000). */
export const MAX_TEXTO = 300;
export const MAX_AREA = 3000;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TELEFONO = /^\+?[0-9][0-9\s-]{5,19}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function campoVisible(
  campo: CampoReclamo,
  valores: Record<string, string>,
): boolean {
  const condicion = CONDICIONALES[campo.nombre];
  return !condicion || valores[condicion.campo] === condicion.valor;
}

export function campoObligatorio(
  campo: CampoReclamo,
  valores: Record<string, string>,
): boolean {
  return campo.obligatorio || (CONDICIONALES[campo.nombre] !== undefined && campoVisible(campo, valores));
}

function fechaReal(texto: string): boolean {
  if (!FECHA.test(texto)) return false;
  const [anio, mes, dia] = texto.split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

export type ResultadoReclamo =
  | { ok: true; datos: Record<string, string> }
  | { ok: false; errores: Record<string, string> };

/**
 * Revisa lo escrito y devuelve lo que se manda a la base (solo campos
 * conocidos y visibles, sin espacios de sobra) o los errores por campo.
 * `hoy` es "AAAA-MM-DD": la fecha del pago no puede ser futura.
 */
export function validarReclamo(
  campos: CampoReclamo[],
  valores: Record<string, string>,
  hoy: string,
): ResultadoReclamo {
  const errores: Record<string, string> = {};
  const datos: Record<string, string> = {};

  for (const campo of campos) {
    if (!campoVisible(campo, valores)) continue;
    const valor = (valores[campo.nombre] ?? "").trim();
    if (valor === "") {
      if (campoObligatorio(campo, valores)) errores[campo.nombre] = "Falta este dato.";
      continue;
    }
    const maximo = campo.tipo === "area" ? MAX_AREA : MAX_TEXTO;
    if (valor.length > maximo) {
      errores[campo.nombre] = `Es muy largo: máximo ${maximo} letras.`;
      continue;
    }
    switch (campo.tipo) {
      case "email":
        if (!EMAIL.test(valor)) errores[campo.nombre] = "Revisa el correo: falta la @ o el punto.";
        else datos[campo.nombre] = valor;
        break;
      case "telefono":
        if (!TELEFONO.test(valor)) errores[campo.nombre] = "Escribe solo números, por ejemplo 987654321.";
        else datos[campo.nombre] = valor;
        break;
      case "numero": {
        // Plata: "29,50" y "29.50" valen igual. Nunca parseFloat suelto.
        const monto = parseMoney(valor);
        if (monto === null || monto < 0) errores[campo.nombre] = "Escribe el monto así: 29.50";
        else datos[campo.nombre] = monto.toFixed(2);
        break;
      }
      case "fecha":
        if (!fechaReal(valor)) errores[campo.nombre] = "Elige una fecha válida.";
        else if (valor > hoy) errores[campo.nombre] = "La fecha no puede ser después de hoy.";
        else datos[campo.nombre] = valor;
        break;
      case "opcion":
        if (!campo.opciones?.includes(valor)) errores[campo.nombre] = "Elige una de las opciones.";
        else datos[campo.nombre] = valor;
        break;
      default:
        datos[campo.nombre] = valor;
    }
  }

  return Object.keys(errores).length > 0 ? { ok: false, errores } : { ok: true, datos };
}

/** Traduce el error de la base a algo que la persona pueda resolver. */
export function mensajeErrorReclamo(error: { message?: string } | null): string {
  const texto = error?.message ?? "";
  if (texto.includes("RECLAMO_FALTA_CAMPO") || texto.includes("RECLAMO_INVALIDO")) {
    return "Algún dato no se pudo guardar así. Revisa el formulario y vuelve a enviar.";
  }
  return "No se pudo registrar tu reclamo. Revisa tu señal y vuelve a enviar: lo que escribiste sigue en el formulario.";
}
