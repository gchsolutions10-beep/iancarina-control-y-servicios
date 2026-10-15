import Decimal from "decimal.js";

/**
 * Lenguaje mínimo y seguro para las fórmulas configurables (sin eval): números con punto decimal,
 * variables declaradas, + − × ÷, paréntesis, comparaciones (< <= > >= = <>), y las funciones
 * min(a, b, …), max(a, b, …), si(condición, a, b) y redondear(x, decimales).
 * Se analiza a un árbol y se evalúa con aritmética decimal (decimal.js), nunca con float.
 */

export type Nodo =
  | { t: "num"; v: string }
  | { t: "var"; n: string }
  | { t: "neg"; e: Nodo }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "<" | "<=" | ">" | ">=" | "=" | "<>"; a: Nodo; b: Nodo }
  | { t: "fn"; f: Funcion; args: Nodo[] };

export const FUNCIONES = ["min", "max", "si", "redondear"] as const;
type Funcion = (typeof FUNCIONES)[number];

/** Variables que puede usar una fórmula y qué significan (se muestran en Configuración). */
export const VARIABLES = {
  valor_bien: "Valor del bien (vehículo o propiedad)",
  aditamentos: "Aditamentos y blindaje declarados (0 si no hay)",
  suma_asegurada: "Suma asegurada del asegurado o de la cobertura",
  tasa: "Tasa anual de la tarifa del período (en %, 2,5 % = 2,5)",
  prima_fija: "Prima fija anual de la tarifa del período",
  dias: "Días que el asegurado está incluido en el período",
  dias_periodo: "Días de la vigencia del período",
} as const;
export type Variable = keyof typeof VARIABLES;
export const esVariable = (v: string): v is Variable => Object.hasOwn(VARIABLES, v);

export class ErrorExpresion extends Error {}

type Token = { k: "num" | "id" | "op" | "(" | ")" | ","; v: string; pos: number };

function tokenizar(texto: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const resto = texto.slice(i);
    const num = /^\d+(\.\d+)?/.exec(resto);
    if (num) {
      tokens.push({ k: "num", v: num[0], pos: i });
      i += num[0].length;
      continue;
    }
    const id = /^[a-z_][a-z0-9_]*/i.exec(resto);
    if (id) {
      tokens.push({ k: "id", v: id[0].toLowerCase(), pos: i });
      i += id[0].length;
      continue;
    }
    const op = /^(<=|>=|<>|[+\-*/<>=×÷])/.exec(resto);
    if (op) {
      tokens.push({ k: "op", v: op[0] === "×" ? "*" : op[0] === "÷" ? "/" : op[0], pos: i });
      i += op[0].length;
      continue;
    }
    if (c === "(" || c === ")" || c === ",") {
      tokens.push({ k: c, v: c, pos: i });
      i++;
      continue;
    }
    throw new ErrorExpresion(`Carácter no permitido «${c}» en la posición ${i + 1}`);
  }
  return tokens;
}

/** Analiza la expresión. Lanza ErrorExpresion con un mensaje claro si no es válida. */
export function analizar(texto: string): Nodo {
  const tokens = tokenizar(texto);
  let p = 0;
  const ver = () => tokens[p];
  const tomar = (k: Token["k"], v?: string) => {
    const t = tokens[p];
    if (!t || t.k !== k || (v !== undefined && t.v !== v)) {
      throw new ErrorExpresion(t ? `Se esperaba «${v ?? k}» en la posición ${t.pos + 1}` : `La fórmula termina antes de tiempo (falta «${v ?? k}»)`);
    }
    p++;
    return t;
  };

  const comparacion = (): Nodo => {
    const a = suma();
    const t = ver();
    if (t?.k === "op" && ["<", "<=", ">", ">=", "=", "<>"].includes(t.v)) {
      p++;
      return { t: "bin", op: t.v as "<", a, b: suma() };
    }
    return a;
  };
  const suma = (): Nodo => {
    let a = producto();
    while (ver()?.k === "op" && (ver().v === "+" || ver().v === "-")) {
      const op = tokens[p++].v as "+" | "-";
      a = { t: "bin", op, a, b: producto() };
    }
    return a;
  };
  const producto = (): Nodo => {
    let a = unario();
    while (ver()?.k === "op" && (ver().v === "*" || ver().v === "/")) {
      const op = tokens[p++].v as "*" | "/";
      a = { t: "bin", op, a, b: unario() };
    }
    return a;
  };
  const unario = (): Nodo => {
    if (ver()?.k === "op" && ver().v === "-") {
      p++;
      return { t: "neg", e: unario() };
    }
    return primario();
  };
  const primario = (): Nodo => {
    const t = ver();
    if (!t) throw new ErrorExpresion("La fórmula está incompleta");
    if (t.k === "num") {
      p++;
      return { t: "num", v: t.v };
    }
    if (t.k === "(") {
      p++;
      const e = comparacion();
      tomar(")");
      return e;
    }
    if (t.k === "id") {
      p++;
      if (ver()?.k === "(") {
        if (!(FUNCIONES as readonly string[]).includes(t.v)) throw new ErrorExpresion(`Función desconocida «${t.v}». Se admiten: ${FUNCIONES.join(", ")}`);
        p++;
        const args: Nodo[] = [];
        if (ver()?.k !== ")") {
          args.push(comparacion());
          while (ver()?.k === ",") {
            p++;
            args.push(comparacion());
          }
        }
        tomar(")");
        const f = t.v as Funcion;
        if (f === "si" && args.length !== 3) throw new ErrorExpresion("si(condición, valor_si, valor_no) lleva 3 argumentos");
        if (f === "redondear" && args.length !== 2) throw new ErrorExpresion("redondear(valor, decimales) lleva 2 argumentos");
        if ((f === "min" || f === "max") && args.length < 2) throw new ErrorExpresion(`${f}() lleva al menos 2 argumentos`);
        return { t: "fn", f, args };
      }
      if (!esVariable(t.v)) throw new ErrorExpresion(`Variable desconocida «${t.v}». Se admiten: ${Object.keys(VARIABLES).join(", ")}`);
      return { t: "var", n: t.v };
    }
    throw new ErrorExpresion(`«${t.v}» inesperado en la posición ${t.pos + 1}`);
  };

  if (tokens.length === 0) throw new ErrorExpresion("Escribe la fórmula");
  const arbol = comparacion();
  if (p < tokens.length) throw new ErrorExpresion(`«${tokens[p].v}» inesperado en la posición ${tokens[p].pos + 1}`);
  return arbol;
}

/** Variables que aparecen en la expresión (en orden de aparición, sin repetir). */
export function variablesDe(nodo: Nodo): Variable[] {
  const vistas = new Set<Variable>();
  const recorrer = (n: Nodo) => {
    if (n.t === "var") vistas.add(n.n as Variable);
    else if (n.t === "neg") recorrer(n.e);
    else if (n.t === "bin") {
      recorrer(n.a);
      recorrer(n.b);
    } else if (n.t === "fn") n.args.forEach(recorrer);
  };
  recorrer(nodo);
  return [...vistas];
}

export type Entradas = Partial<Record<Variable, Decimal.Value | null>>;
export type Evaluacion = { ok: true; valor: Decimal } | { ok: false; faltantes: Variable[] } | { ok: false; error: string; faltantes?: undefined };

const VERDADERO = new Decimal(1);
const FALSO = new Decimal(0);

/**
 * Evalúa con aritmética decimal. Si falta una variable que se necesita, devuelve la lista de
 * faltantes (sin inventar valores): `si()` solo evalúa la rama que corresponde.
 */
export function evaluar(nodo: Nodo, entradas: Entradas): Evaluacion {
  const faltantes = new Set<Variable>();
  class Falta extends Error {}
  const ev = (n: Nodo): Decimal => {
    switch (n.t) {
      case "num":
        return new Decimal(n.v);
      case "var": {
        const v = entradas[n.n as Variable];
        if (v === null || v === undefined || v === "") {
          faltantes.add(n.n as Variable);
          throw new Falta();
        }
        return new Decimal(v);
      }
      case "neg":
        return ev(n.e).neg();
      case "bin": {
        // Se evalúan los dos lados para reunir todos los faltantes de una vez.
        let a: Decimal | null = null;
        let b: Decimal | null = null;
        try {
          a = ev(n.a);
        } catch (e) {
          if (!(e instanceof Falta)) throw e;
        }
        try {
          b = ev(n.b);
        } catch (e) {
          if (!(e instanceof Falta)) throw e;
        }
        if (a === null || b === null) throw new Falta();
        switch (n.op) {
          case "+": return a.plus(b);
          case "-": return a.minus(b);
          case "*": return a.times(b);
          case "/":
            if (b.isZero()) throw new ErrorExpresion("División entre cero");
            return a.div(b);
          case "<": return a.lt(b) ? VERDADERO : FALSO;
          case "<=": return a.lte(b) ? VERDADERO : FALSO;
          case ">": return a.gt(b) ? VERDADERO : FALSO;
          case ">=": return a.gte(b) ? VERDADERO : FALSO;
          case "=": return a.eq(b) ? VERDADERO : FALSO;
          case "<>": return a.eq(b) ? FALSO : VERDADERO;
        }
        throw new ErrorExpresion("Operador no válido");
      }
      case "fn": {
        if (n.f === "si") return ev(n.args[0]).isZero() ? ev(n.args[2]) : ev(n.args[1]);
        const vals = n.args.map(ev);
        if (n.f === "min") return Decimal.min(...vals);
        if (n.f === "max") return Decimal.max(...vals);
        const dec = vals[1].toNumber();
        if (!Number.isInteger(dec) || dec < 0 || dec > 8) throw new ErrorExpresion("redondear: los decimales van de 0 a 8");
        return vals[0].toDecimalPlaces(dec, Decimal.ROUND_HALF_UP);
      }
    }
  };
  try {
    return { ok: true, valor: ev(nodo) };
  } catch (e) {
    if (e instanceof Falta) return { ok: false, faltantes: [...faltantes] };
    if (e instanceof ErrorExpresion) return { ok: false, error: e.message };
    throw e;
  }
}

/** Valida el texto de una fórmula: null si está bien, o el mensaje de error. */
export function validarExpresion(texto: string): string | null {
  try {
    analizar(texto);
    return null;
  } catch (e) {
    if (e instanceof ErrorExpresion) return e.message;
    throw e;
  }
}

/** Redondeo de importes: mitad hacia arriba al número de decimales de la regla (2 por defecto). */
export const redondear = (v: Decimal, decimales = 2) => v.toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP);
