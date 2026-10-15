/**
 * Vigencias de pólizas (lógica pura). Convención del mercado: rango semiabierto [desde, hasta),
 * donde `hasta` es la fecha de fin que figura en la póliza. 2026-01-01 → 2027-01-01 = 365 días.
 */

export type FechaISO = string;

export const diasEntre = (desde: FechaISO, hasta: FechaISO) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

export function sumarDiasISO(fecha: FechaISO, dias: number): FechaISO {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Misma fecha N años después; el 29 de febrero pasa al 28 si el año no es bisiesto. */
export function sumarAnios(fecha: FechaISO, anios = 1): FechaISO {
  const [a, m, d] = fecha.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a + anios, m, 0)).getUTCDate();
  return `${a + anios}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

export type EstadoVigencia = "borrador" | "anulado" | "futuro" | "vigente" | "por_vencer" | "vencido";

/** Estado que se muestra de un período: en preparación, anulado, futuro, vigente, por vencer o vencido. */
export function estadoVigencia(p: { estado: string; desde: FechaISO; hasta: FechaISO }, hoy: FechaISO, diasAviso: number): EstadoVigencia {
  if (p.estado === "borrador") return "borrador";
  if (p.estado === "anulado") return "anulado";
  if (hoy < p.desde) return "futuro";
  if (hoy >= p.hasta) return "vencido";
  return diasEntre(hoy, p.hasta) <= diasAviso ? "por_vencer" : "vigente";
}

/** ¿La fecha efectiva de un endoso cae dentro de la vigencia? (la baja el día de inicio no deja cobertura). */
export function dentroDeVigencia(fecha: FechaISO, desde: FechaISO, hasta: FechaISO) {
  return fecha >= desde && fecha < hasta;
}
