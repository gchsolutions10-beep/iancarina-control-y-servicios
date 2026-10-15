import "server-only";
import Decimal from "decimal.js";
import type { Prisma } from "@/lib/generated/prisma/client";
import { aplicarFormula, elegirRegla, prorratear, type Contexto, type Regla, type Resultado } from "@/lib/dominio/calculo/motor";
import { diasEntre } from "@/lib/dominio/vigencias";
import { nombreParte } from "@/lib/validations/fichas";

/**
 * Cálculo de sumas aseguradas y primas de un período contra la base, con las reglas de
 * cys.reglas_calculo y las tarifas del período. Cada resultado queda en cys.calculos con la regla,
 * la expresión exacta y las entradas usadas. Si falta algo, el cálculo queda como simulación y
 * dice qué falta (la confirmación se bloquea en actions/polizas.ts).
 */

type Tx = Prisma.TransactionClient;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dec = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? null : new Decimal(v.toString()));

export async function cargarReglas(tx: Tx): Promise<Regla[]> {
  const filas = await tx.reglas_calculo.findMany({ where: { estado: { not: "retirada" } } });
  return filas.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo as Regla["tipo"],
    estado: r.estado as Regla["estado"],
    version: r.version,
    empresa: r.empresa,
    id_aseguradora: r.id_aseguradora === null ? null : Number(r.id_aseguradora),
    id_poliza: r.id_poliza === null ? null : Number(r.id_poliza),
    id_ramo: r.id_ramo,
    id_cobertura: r.id_cobertura,
    expresion: r.expresion,
    evento: r.evento as Regla["evento"],
    metodo: r.metodo as Regla["metodo"],
    base_dias: r.base_dias,
    decimales: r.decimales,
    vigente_desde: iso(r.vigente_desde),
    vigente_hasta: r.vigente_hasta ? iso(r.vigente_hasta) : null,
  }));
}

export type Motor = Awaited<ReturnType<typeof prepararMotor>>;

/** Todo lo necesario para calcular en un período: reglas, tarifas, coberturas y contexto. */
export async function prepararMotor(tx: Tx, idPeriodo: bigint) {
  const periodo = await tx.poliza_periodos.findUniqueOrThrow({ where: { id: idPeriodo }, include: { polizas: true } });
  const [reglas, tarifas, coberturas] = await Promise.all([
    cargarReglas(tx),
    tx.periodo_tarifas.findMany({ where: { id_periodo: idPeriodo } }),
    tx.coberturas.findMany({ where: { id_ramo: periodo.polizas.id_ramo } }),
  ]);
  const desde = iso(periodo.vigencia_desde);
  const hasta = iso(periodo.vigencia_hasta);
  const contexto: Contexto = {
    empresa: periodo.empresa,
    id_aseguradora: Number(periodo.polizas.id_aseguradora),
    id_poliza: Number(periodo.id_poliza),
    id_ramo: periodo.polizas.id_ramo,
    fecha: desde,
  };
  return { periodo, desde, hasta, diasPeriodo: diasEntre(desde, hasta), reglas, tarifas, coberturas, contexto };
}

type DatosInclusion = { valor_bien: Decimal | null; aditamentos: Decimal | null; suma_asegurada: Decimal | null; clase_tarifa: string | null; desde: string; hasta: string };

/** Suma asegurada por regla (si el ramo tiene una); sin regla, vale la que se escribió. */
export function calcularSuma(m: Motor, inc: DatosInclusion): { regla: Regla | null; resultado: Resultado | null; suma: Decimal | null } {
  const regla = elegirRegla(m.reglas, "suma_asegurada", m.contexto);
  if (!regla) return { regla: null, resultado: null, suma: inc.suma_asegurada };
  // Sin aditamentos declarados cuentan 0 (propuesta base); el valor del bien sí es obligatorio.
  const resultado = aplicarFormula(regla, { valor_bien: inc.valor_bien, aditamentos: inc.aditamentos ?? 0 });
  return { regla, resultado, suma: resultado.valor };
}

export function tarifaDe(m: Motor, idCobertura: number, clase: string | null) {
  return m.tarifas.find((t) => t.id_cobertura === idCobertura && clase !== null && t.clase === clase) ?? m.tarifas.find((t) => t.id_cobertura === idCobertura && t.clase === null) ?? null;
}

/** Prima anual de una cobertura y su prima por los días incluidos (prorrata de alta si no cubre todo el período). */
export function calcularPrimaLinea(m: Motor, inc: DatosInclusion, idCobertura: number, sumaCobertura: Decimal | null) {
  const cob = m.coberturas.find((c) => c.id === idCobertura);
  const nombre = cob?.nombre ?? `cobertura ${idCobertura}`;
  const tarifa = tarifaDe(m, idCobertura, inc.clase_tarifa);
  const regla = elegirRegla(m.reglas, "prima", { ...m.contexto, id_cobertura: idCobertura });
  const dias = diasEntre(inc.desde, inc.hasta);
  const detalle = `${nombre}${inc.clase_tarifa && !tarifa ? ` (clase ${inc.clase_tarifa})` : ""}`;
  const anual = aplicarFormula(
    regla,
    {
      suma_asegurada: sumaCobertura ?? inc.suma_asegurada,
      valor_bien: inc.valor_bien,
      aditamentos: inc.aditamentos ?? 0,
      tasa: dec(tarifa?.tasa),
      prima_fija: dec(tarifa?.prima_fija),
      dias,
      dias_periodo: m.diasPeriodo,
    },
    detalle,
    `regla de prima para ${nombre}`,
  );
  let periodo: Decimal | null = null;
  let reglaProrrateo: Regla | null = null;
  const faltantes = [...anual.faltantes];
  if (anual.valor) {
    if (dias === m.diasPeriodo) periodo = anual.valor;
    else {
      reglaProrrateo = elegirRegla(m.reglas, "prorrateo", { ...m.contexto, id_cobertura: idCobertura, evento: "alta" });
      const p = prorratear(anual.valor, dias, reglaProrrateo);
      periodo = p.valor;
      if (p.faltante) faltantes.push(p.faltante);
    }
  }
  return { anual, periodo, dias, reglaProrrateo, faltantes, nombre };
}

/** Guarda el cálculo (resultado o faltantes) y devuelve su id. */
export async function guardarCalculo(tx: Tx, empresa: string, usuario: number, r: Resultado, tipo: Regla["tipo"], moneda: string, definitivo = false) {
  const c = await tx.calculos.create({
    data: {
      empresa,
      id_regla: r.regla?.id ?? null,
      tipo,
      expresion: r.regla?.expresion ?? null,
      entradas: r.entradas,
      faltantes: r.valor ? [] : r.faltantes,
      resultado: r.valor ? r.valor.toFixed(2) : null,
      moneda,
      estado: definitivo ? "definitivo" : "simulacion",
      creado_por: usuario,
    },
  });
  return c.id;
}

export type FaltanteLinea = { sujeto: string; cobertura: string; faltantes: string[] };

const nombreSujeto = (i: { partes: { tipo: string; nombres: string | null; apellidos: string | null; razon_social: string | null } | null; vehiculos: { placa: string } | null; propiedades: { nombre: string } | null }) =>
  i.vehiculos?.placa ?? i.propiedades?.nombre ?? (i.partes ? nombreParte(i.partes) : "");

/**
 * Recalcula un período en preparación: suma asegurada (si hay regla) y prima de cada cobertura que no
 * tenga importe de la aseguradora. Devuelve lo que falta para poder confirmar.
 */
export async function recalcularPeriodo(tx: Tx, idPeriodo: bigint, usuario: number) {
  const m = await prepararMotor(tx, idPeriodo);
  if (m.periodo.estado !== "borrador") throw new Error("Solo se recalcula un período en preparación");
  const inclusiones = await tx.inclusiones.findMany({
    where: { id_periodo: idPeriodo },
    include: {
      inclusion_coberturas: true,
      partes: { select: { tipo: true, nombres: true, apellidos: true, razon_social: true } },
      vehiculos: { select: { placa: true } },
      propiedades: { select: { nombre: true } },
    },
  });
  const pendientes: FaltanteLinea[] = [];
  let lineas = 0;
  for (const inc of inclusiones) {
    const datos: DatosInclusion = {
      valor_bien: dec(inc.valor_bien),
      aditamentos: dec(inc.aditamentos),
      suma_asegurada: dec(inc.suma_asegurada),
      clase_tarifa: inc.clase_tarifa,
      desde: iso(inc.desde),
      hasta: iso(inc.hasta),
    };
    const sujeto = nombreSujeto(inc);
    const s = calcularSuma(m, datos);
    if (s.resultado) {
      const idCalc = await guardarCalculo(tx, inc.empresa, usuario, s.resultado, "suma_asegurada", m.periodo.moneda);
      await tx.inclusiones.update({ where: { id: inc.id }, data: { suma_asegurada: s.suma?.toFixed(2) ?? null, id_calculo_suma: idCalc } });
      if (!s.suma) pendientes.push({ sujeto, cobertura: "Suma asegurada", faltantes: s.resultado.faltantes });
      datos.suma_asegurada = s.suma;
    }
    if (inc.inclusion_coberturas.length === 0) pendientes.push({ sujeto, cobertura: "—", faltantes: ["al menos una cobertura"] });
    for (const ic of inc.inclusion_coberturas) {
      lineas++;
      if (ic.origen === "aseguradora") continue;
      const r = calcularPrimaLinea(m, datos, ic.id_cobertura, dec(ic.suma_asegurada));
      const idCalc = await guardarCalculo(tx, inc.empresa, usuario, r.anual, "prima", m.periodo.moneda);
      const completo = r.anual.valor !== null && r.periodo !== null;
      await tx.inclusion_coberturas.update({
        where: { id: ic.id },
        data: {
          prima_anual: completo ? r.anual.valor!.toFixed(2) : null,
          prima_periodo: completo ? r.periodo!.toFixed(2) : null,
          origen: completo ? "calculada" : null,
          id_calculo: idCalc,
          prima_calculada: null,
          motivo_ajuste: null,
          ajustado_por: null,
        },
      });
      if (!completo) pendientes.push({ sujeto, cobertura: r.nombre, faltantes: r.faltantes });
    }
  }
  return { lineas, pendientes };
}

/** Resume los faltantes para un mensaje: «Falta: tasa de Casco (3 asegurados); …». */
export function resumirFaltantes(pendientes: FaltanteLinea[], max = 6) {
  const conteo = new Map<string, number>();
  for (const p of pendientes) for (const f of p.faltantes) conteo.set(f, (conteo.get(f) ?? 0) + 1);
  const partes = [...conteo.entries()].map(([f, n]) => (n > 1 ? `${f} (${n} asegurados)` : f));
  return partes.slice(0, max).join("; ") + (partes.length > max ? `; y ${partes.length - max} más` : "");
}
