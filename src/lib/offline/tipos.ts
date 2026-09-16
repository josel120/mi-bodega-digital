import type {
  CustomerDebt,
  PaymentMethod,
  Transaction,
  TransactionType,
} from "@/types/database";

/** Un movimiento tal como lo ve la pantalla: el del servidor más su estado local. */
export type MovimientoLocal = Transaction & {
  /** Anotado en el teléfono y todavía no subido a Supabase. */
  pendiente?: boolean;
  /** La subida se rechazó: necesita que la bodeguera decida algo. */
  trabado?: boolean;
};

export type FiadoLocal = CustomerDebt & {
  pendiente?: boolean;
  trabado?: boolean;
  /** Cuántos movimientos de este cliente siguen sin subir. */
  sinSubir?: number;
};

/** Los cambios que la pantalla de edición puede hacerle a un movimiento. */
export interface CambiosMovimiento {
  type: TransactionType;
  amount: number;
  description: string;
  payment_method: PaymentMethod;
}

/**
 * Lo que puede quedar esperando señal.
 *
 * Todas llevan el id decidido en el teléfono, no en Postgres. Ese id es la
 * clave de idempotencia: si la subida se reintenta, el segundo INSERT choca
 * contra la llave primaria y sabemos que ya estaba arriba en vez de duplicar
 * la venta.
 */
export type Operacion =
  | { tipo: "crear_movimiento"; fila: Transaction }
  | { tipo: "editar_movimiento"; id: string; cambios: CambiosMovimiento }
  | { tipo: "borrar_movimiento"; id: string }
  | { tipo: "crear_fiado"; fila: CustomerDebt }
  | {
      tipo: "ajustar_fiado";
      debtId: string;
      /** Positivo = fió más. Negativo = abonó. Guardamos la DIFERENCIA, nunca
       *  el saldo final: el saldo del servidor puede haber cambiado desde otro
       *  teléfono mientras esto esperaba señal. */
      delta: number;
      nombre: string;
    };

export interface Pendiente {
  /** Lo pone IndexedDB. Es también el orden en que se sube. */
  seq: number;
  /** Id de la operación, no de la fila. Hace idempotente el ajuste de fiados. */
  opId: string;
  merchantId: string;
  creadoEn: string;
  intentos: number;
  /** El servidor la rechazó por algo que no se arregla reintentando. */
  trabado: boolean;
  motivo: string | null;
  op: Operacion;
}

/** Pendiente recién armado, antes de que IndexedDB le ponga el `seq`. */
export type PendienteNuevo = Omit<Pendiente, "seq">;

export interface ResultadoSubida {
  subidos: number;
  restantes: number;
  trabados: number;
  sinSenal: boolean;
}
