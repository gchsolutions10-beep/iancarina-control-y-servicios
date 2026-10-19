import { diasEntre } from "@/lib/dominio/vigencias";

/**
 * Reglas de los avisos (lógica pura, probada en tests/reportes.test.ts). Una póliza se avisa dentro del
 * plazo hacia adelante y, si ya venció sin renovarse, solo dentro del mismo plazo hacia atrás: así no se
 * acumulan pólizas que se dejaron vencer a propósito. Las primas y cobros vencidos con saldo se avisan
 * siempre, hasta que se paguen o se anulen.
 */
export function enVentana(fecha: string, hoy: string, plazo: number): boolean {
  const d = diasEntre(hoy, fecha);
  return d <= plazo && d >= -plazo;
}

export type Gravedad = "vencido" | "proximo";
export const gravedad = (fecha: string, hoy: string): Gravedad => (fecha < hoy ? "vencido" : "proximo");

export type Aviso = {
  id: string;
  tipo: "poliza" | "prima" | "cobro" | "siniestro";
  gravedad: Gravedad;
  titulo: string;
  detalle: string;
  fecha: string;
  enlace: string;
  empresa: string;
};

/** Orden: lo vencido primero, luego lo más próximo. */
export function ordenarAvisos(avisos: Aviso[]): Aviso[] {
  return [...avisos].sort((a, b) => (a.gravedad === b.gravedad ? a.fecha.localeCompare(b.fecha) : a.gravedad === "vencido" ? -1 : 1));
}
