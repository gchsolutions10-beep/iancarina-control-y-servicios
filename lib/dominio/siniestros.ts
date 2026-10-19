import Decimal from "decimal.js";
import { diasEntre } from "./vigencias";

/**
 * Siniestros (lógica pura, probada en tests/siniestros.test.ts): numeración de expedientes,
 * importe vigente, consumo de límites, etapas, documentos requeridos y estado para el control.
 */

/** SIN-AAAA-NNNN, consecutivo por empresa que reinicia cada año (pregunta 23). */
export const numeroExpediente = (anio: number, consecutivo: number) => `SIN-${anio}-${String(consecutivo).padStart(4, "0")}`;

/** Siguiente consecutivo del año a partir de los números ya usados (ignora otros formatos). */
export function siguienteConsecutivo(anio: number, usados: string[]): number {
  const patron = new RegExp(`^SIN-${anio}-(\\d+)$`);
  return usados.reduce((max, n) => Math.max(max, Number(patron.exec(n)?.[1] ?? 0)), 0) + 1;
}

export type TipoImporte = "presupuestado" | "autorizado" | "reconocido";
export const TIPOS_IMPORTE: Record<TipoImporte, string> = { presupuestado: "Presupuestado", autorizado: "Autorizado", reconocido: "Reconocido" };

/** El vigente de cada tipo es el último registrado (mayor id); los anteriores son historial. */
export function importesVigentes(importes: { id: number; tipo: string; monto: Decimal.Value }[]): Partial<Record<TipoImporte, Decimal>> {
  const vigentes: Partial<Record<TipoImporte, { id: number; monto: Decimal }>> = {};
  for (const i of importes) {
    const t = i.tipo as TipoImporte;
    if (!vigentes[t] || i.id > vigentes[t]!.id) vigentes[t] = { id: i.id, monto: new Decimal(i.monto) };
  }
  return Object.fromEntries(Object.entries(vigentes).map(([t, v]) => [t, v!.monto]));
}

export type EstadoLimite = "ok" | "aviso" | "excedido";
export type Consumo = { monto: Decimal; consumido: Decimal; disponible: Decimal; porcentaje: Decimal; estado: EstadoLimite };

/** Consumo de un límite: Σ importes que consume ÷ monto. Aviso desde `avisoPct` %, excedido al pasar el 100 %. */
export function consumoLimite(monto: Decimal.Value, consumos: Decimal.Value[], avisoPct: number): Consumo {
  const m = new Decimal(monto);
  const consumido = consumos.reduce<Decimal>((s, c) => s.plus(c), new Decimal(0));
  const porcentaje = m.isZero() ? new Decimal(0) : consumido.div(m).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const estado: EstadoLimite = consumido.gt(m) ? "excedido" : porcentaje.gte(avisoPct) ? "aviso" : "ok";
  return { monto: m, consumido, disponible: m.minus(consumido), porcentaje, estado };
}

/**
 * ¿Se puede registrar un nuevo importe que consume el límite? `actualDelExpediente` es lo que ese
 * expediente ya consumía (se reemplaza, no se suma). Bloquea si pasaría del 100 % y explica el cálculo.
 */
export function evaluarNuevoImporte(
  limite: { descripcion: string; monto: Decimal.Value; moneda: string },
  consumidoTotal: Decimal.Value,
  actualDelExpediente: Decimal.Value,
  nuevo: Decimal.Value,
  avisoPct: number,
): { permitido: boolean; aviso: string | null } {
  const otros = new Decimal(consumidoTotal).minus(actualDelExpediente);
  const despues = otros.plus(nuevo);
  const m = new Decimal(limite.monto);
  const pct = m.isZero() ? new Decimal(0) : despues.div(m).times(100);
  const calculo = `${limite.descripcion}: límite ${m.toFixed(2)} ${limite.moneda} − consumido por otros ${otros.toFixed(2)} = disponible ${m.minus(otros).toFixed(2)}; con este importe quedaría en ${pct.toFixed(1)} %`;
  if (despues.gt(m)) return { permitido: false, aviso: `Supera el límite. ${calculo}.` };
  if (pct.gte(avisoPct)) return { permitido: true, aviso: `Aviso: consumo alto del límite. ${calculo}.` };
  return { permitido: true, aviso: null };
}

/** Siguiente etapa del flujo según el orden (null si la actual es la última). */
export function siguienteEtapa<T extends { id: number; orden: number }>(etapas: T[], actual: number | null): T | null {
  const ordenadas = [...etapas].sort((a, b) => a.orden - b.orden);
  if (actual === null) return ordenadas[0] ?? null;
  const i = ordenadas.findIndex((e) => e.id === actual);
  return i >= 0 ? (ordenadas[i + 1] ?? null) : null;
}

/** Documentos requeridos por la etapa que todavía no se subieron al expediente (por tipo de documento). */
export function documentosFaltantes(requeridos: string[], subidos: string[]): string[] {
  const hay = new Set(subidos.map((s) => s.toLowerCase()));
  return requeridos.filter((r) => !hay.has(r.toLowerCase()));
}

export type EstadoControl = "abierto" | "sin_movimiento" | "por_cobrar" | "cerrado" | "anulado";

/**
 * Estado para las tarjetas de control: un expediente abierto sin actuaciones, etapas ni importes en
 * `dias` días está «sin movimiento»; uno cerrado con saldo por cobrar sigue «por cobrar» (R12).
 */
export function estadoControl(s: { estado: string; ultimaActividad: string; saldoPorCobrar: Decimal.Value }, hoy: string, dias: number): EstadoControl {
  if (s.estado === "anulado") return "anulado";
  if (s.estado === "cerrado") return new Decimal(s.saldoPorCobrar).gt(0) ? "por_cobrar" : "cerrado";
  return diasEntre(s.ultimaActividad, hoy) > dias ? "sin_movimiento" : "abierto";
}
