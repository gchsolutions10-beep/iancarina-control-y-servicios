/**
 * CSV para Excel en español: separador «;», coma decimal y BOM UTF-8 (acentos correctos).
 */
export type ValorCsv = string | number | Date | null | undefined;

function celda(v: ValorCsv): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isFinite(v) ? String(v).replace(".", ",") : "";
  return /[;"\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

export function aCsv(encabezados: string[], filas: ValorCsv[][]): string {
  return "﻿" + [encabezados, ...filas].map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}
