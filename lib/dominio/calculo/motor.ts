import Decimal from "decimal.js";
import { analizar, evaluar, redondear, VARIABLES, type Entradas, type Variable } from "./expresiones";

/**
 * Motor de cálculo (lógica pura): elige la regla aplicable y calcula sumas aseguradas, primas
 * anuales y prorratas. Las reglas se configuran en la base (cys.reglas_calculo); aquí no hay
 * ninguna tasa ni importe fijo. Probado en tests/calculo.test.ts.
 */

export type Regla = {
  id: number;
  nombre: string;
  tipo: "suma_asegurada" | "prima" | "prorrateo";
  estado: "propuesta" | "aprobada" | "retirada";
  version: number;
  empresa: string | null;
  id_aseguradora: number | null;
  id_poliza: number | null;
  id_ramo: number | null;
  id_cobertura: number | null;
  expresion: string | null;
  evento: "alta" | "baja" | null;
  metodo: "dias" | "solo_aseguradora" | null;
  base_dias: number | null;
  decimales: number;
  vigente_desde: string;
  vigente_hasta: string | null;
};

export type Contexto = {
  empresa: string;
  id_aseguradora: number;
  id_poliza: number;
  id_ramo: number;
  id_cobertura?: number;
  /** Fecha que decide la vigencia de la regla (inicio del período o fecha del endoso). */
  fecha: string;
  evento?: "alta" | "baja";
};

const PESO = { id_poliza: 16, id_aseguradora: 8, id_cobertura: 4, id_ramo: 2, empresa: 1 } as const;

/**
 * Regla más específica que aplica: cada campo de ámbito que la regla tenga debe coincidir con el
 * contexto. Gana póliza > aseguradora > cobertura > ramo > empresa > general; a igual ámbito, la
 * versión más nueva. Las retiradas y las que no están vigentes en la fecha no cuentan.
 */
export function elegirRegla(reglas: Regla[], tipo: Regla["tipo"], c: Contexto): Regla | null {
  let mejor: { r: Regla; peso: number } | null = null;
  for (const r of reglas) {
    if (r.tipo !== tipo || r.estado === "retirada") continue;
    if (r.vigente_desde > c.fecha || (r.vigente_hasta !== null && r.vigente_hasta < c.fecha)) continue;
    if (tipo === "prorrateo" && r.evento !== c.evento) continue;
    if (r.empresa !== null && r.empresa !== c.empresa) continue;
    if (r.id_aseguradora !== null && r.id_aseguradora !== c.id_aseguradora) continue;
    if (r.id_poliza !== null && r.id_poliza !== c.id_poliza) continue;
    if (r.id_ramo !== null && r.id_ramo !== c.id_ramo) continue;
    if (r.id_cobertura !== null && r.id_cobertura !== (c.id_cobertura ?? null)) continue;
    const peso = (Object.keys(PESO) as (keyof typeof PESO)[]).reduce((s, k) => s + (r[k] !== null ? PESO[k] : 0), 0);
    if (!mejor || peso > mejor.peso || (peso === mejor.peso && (r.version > mejor.r.version || (r.version === mejor.r.version && r.id > mejor.r.id)))) {
      mejor = { r, peso };
    }
  }
  return mejor?.r ?? null;
}

export type Resultado = {
  /** null cuando faltan datos (solo simulación: la confirmación queda bloqueada). */
  valor: Decimal | null;
  faltantes: string[];
  entradas: Record<string, string | null>;
  regla: Regla | null;
};

/** Descripción para el usuario de cada variable faltante; `detalle` agrega cobertura y clase. */
export function describirFaltante(v: Variable, detalle?: string) {
  const base = v === "tasa" ? "tasa" : v === "prima_fija" ? "prima fija" : VARIABLES[v].split(" (")[0].toLowerCase();
  return detalle && (v === "tasa" || v === "prima_fija") ? `${base} de ${detalle}` : base;
}

/** Evalúa la fórmula de una regla de suma asegurada o de prima. */
export function aplicarFormula(regla: Regla | null, entradas: Entradas, detalle?: string, sinRegla = "No hay regla de cálculo aplicable"): Resultado {
  const copia = Object.fromEntries(Object.entries(entradas).map(([k, v]) => [k, v === null || v === undefined ? null : new Decimal(v).toString()]));
  if (!regla?.expresion) return { valor: null, faltantes: [sinRegla], entradas: copia, regla };
  const r = evaluar(analizar(regla.expresion), entradas);
  if (r.ok) {
    if (r.valor.isNegative()) return { valor: null, faltantes: ["la fórmula dio un resultado negativo"], entradas: copia, regla };
    return { valor: redondear(r.valor, regla.decimales), faltantes: [], entradas: copia, regla };
  }
  if (r.faltantes) return { valor: null, faltantes: r.faltantes.map((v) => describirFaltante(v, detalle)), entradas: copia, regla };
  return { valor: null, faltantes: [r.error], entradas: copia, regla };
}

/**
 * Prorrata por días: prima anual × días ÷ base de la regla, redondeada. Sin regla, o con el método
 * «solo importe de la aseguradora», no calcula y dice qué falta.
 */
export function prorratear(primaAnual: Decimal, dias: number, regla: Regla | null): { valor: Decimal | null; faltante: string | null } {
  if (!regla) return { valor: null, faltante: "regla de prorrateo" };
  if (regla.metodo === "solo_aseguradora") return { valor: null, faltante: "importe de la aseguradora (la regla de prorrateo no calcula)" };
  if (!regla.base_dias) return { valor: null, faltante: "base de días de la regla de prorrateo" };
  return { valor: redondear(primaAnual.times(dias).div(regla.base_dias), regla.decimales), faltante: null };
}

/** Línea de cobertura para totales: lo incluido en otra cobertura no se suma dos veces (R11). */
export type LineaPrima = { cobertura: string; incluidaEnPadre: boolean; prima: Decimal.Value | null };

export function totalPrimas(lineas: LineaPrima[]): Decimal {
  return lineas.filter((l) => !l.incluidaEnPadre && l.prima !== null).reduce((s, l) => s.plus(l.prima as Decimal.Value), new Decimal(0));
}

/** Tasa promedio ponderada (%): Σ primas ÷ Σ sumas aseguradas × 100. null si no hay suma. */
export function tasaPromedio(primas: Decimal.Value, sumas: Decimal.Value): Decimal | null {
  const s = new Decimal(sumas);
  return s.isZero() ? null : new Decimal(primas).div(s).times(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/** Variación interanual: (actual − anterior) ÷ anterior. null si el anterior es 0. */
export function variacion(actual: Decimal.Value, anterior: Decimal.Value): Decimal | null {
  const a = new Decimal(anterior);
  return a.isZero() ? null : new Decimal(actual).minus(a).div(a);
}
