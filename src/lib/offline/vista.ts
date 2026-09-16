// Pintar la cola encima de lo que dijo el servidor.
//
// Las pantallas nunca leen "el estado mezclado" de ningún lado: toman las filas
// del servidor (frescas o las guardadas del teléfono) y les aplican la cola acá.
// Es una función pura, así que la cifra que ve la bodeguera siempre se puede
// explicar: tanto del servidor, tanto de lo que anotó y todavía no sube.
import type { CustomerDebt, Transaction } from "@/types/database";
import { diaLocalDeISO } from "@/lib/fechas";
import type { FiadoLocal, MovimientoLocal, Pendiente } from "./tipos";

function centimos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function movimientosConPendientes(
  delServidor: Transaction[],
  cola: Pendiente[],
  dia: string,
): MovimientoLocal[] {
  const porId = new Map<string, MovimientoLocal>();
  for (const fila of delServidor) {
    porId.set(fila.id, { ...fila, amount: Number(fila.amount) });
  }

  for (const pendiente of cola) {
    const op = pendiente.op;

    if (op.tipo === "crear_movimiento") {
      // Un movimiento anotado para otro día no ensucia la caja de hoy.
      if (diaLocalDeISO(op.fila.created_at) !== dia) continue;
      porId.set(op.fila.id, {
        ...op.fila,
        amount: Number(op.fila.amount),
        pendiente: true,
        trabado: pendiente.trabado,
      });
      continue;
    }

    if (op.tipo === "editar_movimiento") {
      const actual = porId.get(op.id);
      if (!actual) continue;
      // Una corrección TRABADA no se pinta: el servidor la rechazó, así que la
      // fila sigue como está allá. Se marca y el aviso rojo explica qué pasó.
      if (pendiente.trabado) {
        porId.set(op.id, { ...actual, pendiente: true, trabado: true });
        continue;
      }
      porId.set(op.id, {
        ...actual,
        ...op.cambios,
        pendiente: true,
      });
      continue;
    }

    if (op.tipo === "borrar_movimiento") {
      // Si el borrado quedó trabado, la fila sigue existiendo en el servidor:
      // mentir diciendo que ya no está sería la clase de silencio que no
      // queremos con la plata.
      if (pendiente.trabado) continue;
      porId.delete(op.id);
    }
  }

  return [...porId.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

export function fiadosConPendientes(
  delServidor: CustomerDebt[],
  cola: Pendiente[],
): FiadoLocal[] {
  const porId = new Map<string, FiadoLocal>();
  for (const fila of delServidor) {
    porId.set(fila.id, { ...fila, balance: Number(fila.balance) });
  }

  for (const pendiente of cola) {
    const op = pendiente.op;

    if (op.tipo === "crear_fiado") {
      porId.set(op.fila.id, {
        ...op.fila,
        balance: Number(op.fila.balance),
        pendiente: true,
        trabado: pendiente.trabado,
        sinSubir: 1,
      });
      continue;
    }

    if (op.tipo === "ajustar_fiado") {
      const actual = porId.get(op.debtId);
      if (!actual) continue;

      // Un ajuste TRABADO no se suma al saldo.
      //
      // Esto se vio en vivo: un abono de S/ 15 que el servidor rechazó (porque
      // cobraron desde otro celular y ya no cabía) se seguía pintando encima y
      // la pantalla mostraba una deuda de S/ -6.50. Una deuda negativa no
      // existe, y encima contradecía al propio aviso, que dice "nada se recortó
      // solo". La regla quedó así: lo que el servidor rechazó no mueve ninguna
      // cifra, solo levanta la bandera; el aviso rojo de arriba dice de cuánto
      // era y a quién, para que lo resuelva una persona.
      if (pendiente.trabado) {
        porId.set(op.debtId, { ...actual, pendiente: true, trabado: true });
        continue;
      }

      porId.set(op.debtId, {
        ...actual,
        balance: centimos(actual.balance + op.delta),
        pendiente: true,
        trabado: actual.trabado,
        sinSubir: (actual.sinSubir ?? 0) + 1,
      });
    }
  }

  return [...porId.values()].sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
  );
}
