import Decimal from "decimal.js";
import { diasEntre } from "./vigencias";

/**
 * Saldos de obligaciones (lógica pura). El saldo siempre sale de los movimientos:
 * monto = Σ cargos + aumentos − disminuciones − anulaciones; saldo = monto − Σ imputaciones vigentes.
 * «Autorizado» o «reconocido» nunca significa pagado (R12).
 */

export type Movimiento = { tipo: "cargo" | "aumento" | "disminucion" | "anulacion"; monto: Decimal.Value };
export type Imputacion = { id: number; monto: Decimal.Value; revierte_a: number | null };

export function montoObligacion(movimientos: Movimiento[]): Decimal {
  return movimientos.reduce((s, m) => (m.tipo === "cargo" || m.tipo === "aumento" ? s.plus(m.monto) : s.minus(m.monto)), new Decimal(0));
}

/** Imputaciones que siguen valiendo: ni reversiones ni revertidas. */
export function imputacionesVigentes<T extends Imputacion>(lista: T[]): T[] {
  const revertidas = new Set(lista.filter((i) => i.revierte_a !== null).map((i) => i.revierte_a));
  return lista.filter((i) => i.revierte_a === null && !revertidas.has(i.id));
}

export function saldo(movimientos: Movimiento[], imputaciones: Imputacion[]): Decimal {
  return montoObligacion(movimientos).minus(imputacionesVigentes(imputaciones).reduce((s, i) => s.plus(i.monto), new Decimal(0)));
}

export type EstadoPago = "pagada" | "vencida" | "por_vencer" | "pendiente" | "anulada";

/** Estado de una obligación para las tarjetas de control. «Parcial» se informa aparte (imputado > 0). */
export function estadoObligacion(o: { estado: string; saldo: Decimal.Value; vencimiento: string }, hoy: string, diasAviso: number): EstadoPago {
  if (o.estado === "anulada") return "anulada";
  if (new Decimal(o.saldo).lte(0)) return "pagada";
  if (o.vencimiento < hoy) return "vencida";
  return diasEntre(hoy, o.vencimiento) <= diasAviso ? "por_vencer" : "pendiente";
}

/** Valida un pago contra una obligación antes de enviarlo a la base (que también lo valida). */
export function validarImputacion(p: { monto: Decimal.Value; moneda: string }, o: { saldo: Decimal.Value; moneda: string }): string | null {
  if (p.moneda !== o.moneda) return `El pago es en ${p.moneda} y la obligación en ${o.moneda}: el sistema no convierte monedas.`;
  const m = new Decimal(p.monto);
  if (m.lte(0)) return "El monto debe ser mayor que cero.";
  if (m.gt(o.saldo)) return `El monto supera el saldo pendiente (${new Decimal(o.saldo).toFixed(2)} ${o.moneda}).`;
  return null;
}
