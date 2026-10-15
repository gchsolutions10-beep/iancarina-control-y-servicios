import { variable } from "@/lib/entorno";

/**
 * Fechas y horas en la zona de la empresa (no en la del servidor). Las fechas de
 * negocio viajan como texto 'AAAA-MM-DD' para no depender de husos horarios.
 */
export const ZONA_PLANTA = variable("ZONA_HORARIA", "America/Caracas");

export type FechaISO = string; // 'AAAA-MM-DD'

function partesEnZona(instante: Date) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_PLANTA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return {
    fecha: `${valor("year")}-${valor("month")}-${valor("day")}`,
    hora: `${valor("hour")}:${valor("minute")}:${valor("second")}`,
  };
}

/** Fecha civil de hoy en la zona de la empresa. */
export function hoyPlanta(instante = new Date()): FechaISO {
  return partesEnZona(instante).fecha;
}

/**
 * Hora local de la planta como Date cuyos campos UTC son la hora de pared.
 * Prisma guarda los campos UTC en columnas `timestamp without time zone`, así
 * que el valor queda igual que lo que guardaba Access (hora local).
 */
export function ahoraPlanta(instante = new Date()): Date {
  const { fecha, hora } = partesEnZona(instante);
  return new Date(`${fecha}T${hora}Z`);
}

export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diferenciaDias(desde: FechaISO, hasta: FechaISO): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** Date de una columna `date` de Prisma (medianoche UTC) → 'AAAA-MM-DD'. */
export function aFechaISO(fecha: Date): FechaISO {
  return fecha.toISOString().slice(0, 10);
}

export function ultimoDiaDelMes(fecha: FechaISO): FechaISO {
  const [anio, mes] = fecha.split("-").map(Number);
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

export function primerDiaDelMes(fecha: FechaISO): FechaISO {
  return `${fecha.slice(0, 7)}-01`;
}

/** Interpreta fechas guardadas como texto por Access: 'AAAA-MM-DD' o 'DD/MM/AAAA'. */
export function interpretarFechaTexto(valor: string | null | undefined): FechaISO | null {
  if (!valor) return null;
  const texto = valor.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  return null;
}

export function formatearFechaISO(fecha: FechaISO, opciones: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  return new Date(`${fecha}T00:00:00Z`).toLocaleDateString("es-VE", { ...opciones, timeZone: "UTC" });
}

/** Instante real (UTC) del final del día indicado en la zona de la planta. */
export function finDelDiaPlanta(fecha: FechaISO): Date {
  const paredComoUtc = Date.parse(`${fecha}T23:59:59Z`);
  const desfase = ahoraPlanta(new Date(paredComoUtc)).getTime() - paredComoUtc; // ej. -4 h en Caracas
  return new Date(paredComoUtc - desfase);
}

/** Formatea un instante real (timestamptz) en la hora de la planta. */
export function formatearInstante(instante: Date, opciones: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" }) {
  return instante.toLocaleString("es-VE", { ...opciones, timeZone: ZONA_PLANTA });
}

/** Formatea un `timestamp without time zone` heredado (ya es hora de pared). */
export function formatearHoraPared(valor: Date, opciones: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" }) {
  return valor.toLocaleString("es-VE", { ...opciones, timeZone: "UTC" });
}
