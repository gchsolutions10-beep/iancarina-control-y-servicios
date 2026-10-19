/**
 * Motor genérico de reportes (lógica pura, probada en tests/reportes.test.ts): filtros leídos de la
 * URL, formato de columnas, totales por moneda (nunca se suman monedas distintas) y filas para Excel.
 */

export type TipoColumna = "texto" | "fecha" | "entero" | "importe" | "porcentaje";
export type Columna = { titulo: string; tipo: TipoColumna };
export type Valor = string | number | null;

export type Filtro =
  | { clave: string; etiqueta: string; tipo: "texto"; placeholder?: string }
  | { clave: string; etiqueta: string; tipo: "fecha" }
  | { clave: string; etiqueta: string; tipo: "lista"; opciones: { valor: string; etiqueta: string }[]; todos?: string };

export type Resultado = {
  columnas: Columna[];
  filas: Valor[][];
  /** Índice de la columna «Moneda» para sumar los importes por moneda. */
  moneda?: number;
  /** Enlace de cada fila (misma posición que `filas`). */
  enlaces?: (string | null)[];
  /** Columna que lleva el enlace (por defecto la segunda, después de «Empresa»). */
  enlaceEn?: number;
};

type Params = Record<string, string | string[] | undefined>;

/** Valores de los filtros desde la URL: solo claves conocidas; fechas válidas; listas con opción existente. */
export function leerValores(filtros: Filtro[], params: Params): Record<string, string> {
  const r: Record<string, string> = {};
  for (const f of filtros) {
    const v = params[f.clave];
    const t = typeof v === "string" ? v.trim().slice(0, 120) : "";
    if (!t) continue;
    if (f.tipo === "fecha" && !/^\d{4}-\d{2}-\d{2}$/.test(t)) continue;
    if (f.tipo === "lista" && !f.opciones.some((o) => o.valor === t)) continue;
    r[f.clave] = t;
  }
  return r;
}

/** Texto visible de un filtro aplicado (para las etiquetas que se quitan con una «x»). */
export function textoFiltro(f: Filtro, valor: string) {
  return f.tipo === "lista" ? (f.opciones.find((o) => o.valor === valor)?.etiqueta ?? valor) : valor;
}

/** Totales de las columnas de importe agrupados por moneda. */
export function totalesPorMoneda(r: Resultado): { moneda: string; totales: (string | null)[] }[] {
  if (r.moneda === undefined) return [];
  const porMoneda = new Map<string, bigint[]>();
  for (const fila of r.filas) {
    const m = String(fila[r.moneda] ?? "");
    if (!m) continue;
    const acc = porMoneda.get(m) ?? r.columnas.map(() => BigInt(0));
    r.columnas.forEach((c, i) => {
      if (c.tipo === "importe" && fila[i] !== null && fila[i] !== "") acc[i] += centimos(String(fila[i]));
    });
    porMoneda.set(m, acc);
  }
  return [...porMoneda.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moneda, acc]) => ({ moneda, totales: r.columnas.map((c, i) => (c.tipo === "importe" ? deCentimos(acc[i]) : null)) }));
}

/** "1234.5" → 123450n (exacto, sin float). */
export function centimos(v: string): bigint {
  const neg = v.trim().startsWith("-");
  const [e, d = ""] = v.trim().replace("-", "").split(".");
  return (neg ? BigInt(-1) : BigInt(1)) * (BigInt(e || "0") * BigInt(100) + BigInt((d + "00").slice(0, 2)));
}
export function deCentimos(c: bigint): string {
  const neg = c < BigInt(0);
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}${a / BigInt(100)}.${String(a % BigInt(100)).padStart(2, "0")}`;
}

/** Filas para Excel: importes y enteros como número; lo demás como texto. */
export function filasExcel(r: Resultado): (string | number | null)[][] {
  return r.filas.map((f) => f.map((v, i) => (v !== null && v !== "" && (r.columnas[i].tipo === "importe" || r.columnas[i].tipo === "entero" || r.columnas[i].tipo === "porcentaje") ? Number(v) : v)));
}

/** Tramos de antigüedad de un saldo vencido (días desde el vencimiento). */
export function tramoVencimiento(diasVencido: number): string {
  if (diasVencido <= 0) return "Al día";
  if (diasVencido <= 30) return "1–30 días";
  if (diasVencido <= 60) return "31–60 días";
  if (diasVencido <= 90) return "61–90 días";
  return "Más de 90 días";
}

/** Los últimos `n` meses hasta el de `hoy`, como "AAAA-MM" (el más antiguo primero). */
export function ultimosMeses(hoy: string, n: number): string[] {
  const [a, m] = hoy.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const total = a * 12 + (m - 1) - (n - 1 - i);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}
