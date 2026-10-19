import "server-only";
import Decimal from "decimal.js";
import { registrarGestion } from "@/lib/auditoria";
import { elegirRegla, prorratear } from "@/lib/dominio/calculo/motor";
import { diasEntre } from "@/lib/dominio/vigencias";
import { formatearImporte } from "@/lib/formato";
import type { Prisma } from "@/lib/generated/prisma/client";
import { calcularPrimaLinea, calcularSuma, guardarCalculo, prepararMotor, recalcularPeriodo, resumirFaltantes } from "@/lib/polizas/calcular";
import { siguienteEndoso, type sujetoValido } from "@/lib/polizas/edicion";
import { hoyPlanta } from "@/lib/tiempo";
import { nombreParte } from "@/lib/validations/fichas";

/**
 * Núcleo de las operaciones que cambian primas: confirmar un período y los endosos de alta y baja.
 * Corre dentro de una transacción (`tx`) que abre quien llama: las pantallas (actions/) y la carga
 * de datos de ejemplo usan exactamente el mismo cálculo y la misma bitácora.
 */

type Tx = Prisma.TransactionClient;
const fecha = (v: string) => new Date(`${v}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const MODULO = "POLIZAS";

/** Condición de negocio que impide completar la operación (el mensaje es para el usuario). */
export class Bloqueo extends Error {}

export type PeriodoConPoliza = {
  id: bigint;
  empresa: string;
  moneda: string;
  numero_periodo: number;
  vigencia_desde: Date;
  vigencia_hasta: Date;
  polizas: { id_aseguradora: bigint; numero: string };
};

/**
 * Confirma un período en preparación: recalcula, exige tomador, asegurados y primas completas,
 * marca los cálculos como definitivos y genera la prima por pagar. Lanza Bloqueo si falta algo.
 */
export async function confirmarPeriodoTx(tx: Tx, periodo: PeriodoConPoliza, usuario: number, o: { fecha_vencimiento: string; documento: string | null }) {
  const calculo = await recalcularPeriodo(tx, periodo.id, usuario);
  const tomador = await tx.periodo_partes.findFirst({ where: { id_periodo: periodo.id, rol: "tomador" } });
  if (!tomador) throw new Bloqueo("Falta el tomador.");
  if (calculo.lineas === 0) throw new Bloqueo("El período no tiene asegurados.");
  if (calculo.pendientes.length) throw new Bloqueo(`No se puede confirmar: falta ${resumirFaltantes(calculo.pendientes)}. Cárgalo en las tarifas o registra el importe de la aseguradora.`);

  const lineas = await tx.inclusion_coberturas.findMany({ where: { inclusiones: { id_periodo: periodo.id } }, include: { coberturas: true } });
  const total = lineas.filter((l) => !l.coberturas.incluida_en_padre).reduce((s, l) => s.plus(l.prima_periodo!.toString()), new Decimal(0));
  const sumas = await tx.inclusiones.findMany({ where: { id_periodo: periodo.id }, select: { id_calculo_suma: true } });
  const calculos = [...lineas.map((l) => l.id_calculo), ...sumas.map((i) => i.id_calculo_suma)].filter((x): x is bigint => x !== null);
  await tx.calculos.updateMany({ where: { id: { in: calculos } }, data: { estado: "definitivo" } });
  await tx.poliza_periodos.update({ where: { id: periodo.id }, data: { estado: "confirmado", confirmado_por: usuario, confirmado_en: new Date() } });

  let detalle = "sin prima";
  if (total.gt(0)) {
    const hoy = hoyPlanta();
    const desde = iso(periodo.vigencia_desde);
    const emision = hoy < desde ? hoy : desde;
    const ob = await tx.obligaciones.create({
      data: {
        empresa: periodo.empresa, naturaleza: "por_pagar", concepto: "prima", id_contraparte: periodo.polizas.id_aseguradora, id_periodo: periodo.id, moneda: periodo.moneda,
        fecha_emision: fecha(emision), fecha_vencimiento: fecha(o.fecha_vencimiento < emision ? emision : o.fecha_vencimiento), documento: o.documento,
        descripcion: `Prima póliza ${periodo.polizas.numero}, período ${periodo.numero_periodo} (${desde} a ${iso(periodo.vigencia_hasta)})`, creado_por: usuario,
      },
    });
    await tx.obligacion_movimientos.create({ data: { empresa: periodo.empresa, id_obligacion: ob.id, tipo: "cargo", monto: total.toFixed(2), fecha: ob.fecha_emision, motivo: "Confirmación del período", creado_por: usuario } });
    detalle = `prima por pagar ${total.toFixed(2)} ${periodo.moneda} (obligación ${ob.id}, vence ${iso(ob.fecha_vencimiento)})`;
  }
  await registrarGestion(usuario, MODULO, `PERÍODO ${periodo.id} | CONFIRMADO · ${lineas.length} coberturas · ${detalle}`, tx, {
    empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: "CONFIRMAR",
  });
  return `Período confirmado: ${detalle}.`;
}

/** Obligación del endoso: por pagar si cobra, por cobrar (devolución) si devuelve. */
async function crearObligacionEndoso(tx: Tx, periodo: PeriodoConPoliza, idEndoso: bigint, numero: number, prima: Decimal, emision: string, vence: string, usuario: number, documento: string | null) {
  if (prima.isZero()) return "";
  const cobra = prima.gt(0);
  const o = await tx.obligaciones.create({
    data: {
      empresa: periodo.empresa, naturaleza: cobra ? "por_pagar" : "por_cobrar", concepto: cobra ? "ajuste_prima" : "devolucion_prima", id_contraparte: periodo.polizas.id_aseguradora,
      id_periodo: periodo.id, id_endoso: idEndoso, moneda: periodo.moneda, fecha_emision: fecha(emision), fecha_vencimiento: fecha(vence), documento,
      descripcion: `${cobra ? "Prima" : "Devolución de prima"} del endoso ${numero}, póliza ${periodo.polizas.numero} período ${periodo.numero_periodo}`, creado_por: usuario,
    },
  });
  await tx.obligacion_movimientos.create({ data: { empresa: periodo.empresa, id_obligacion: o.id, tipo: "cargo", monto: prima.abs().toFixed(2), fecha: fecha(emision), motivo: `Endoso ${numero}`, creado_por: usuario } });
  return ` · ${cobra ? "por pagar" : "por cobrar"} ${prima.abs().toFixed(2)} (obligación ${o.id})`;
}

export type DatosEndoso = { fecha_efectiva: string; numero_aseguradora: string | null; importe_aseguradora: string | null; motivo: string | null; vencimiento: string };
export type ResultadoEndoso = { ok: true; mensaje: string } | { ok: false; aviso: string };

type DatosAlta = {
  id_sujeto: bigint;
  certificado: string | null;
  ceco: string | null;
  clase_tarifa: string | null;
  valor_bien: string | null;
  aditamentos: string | null;
  suma_asegurada: string | null;
  observaciones: string | null;
};
type Sujeto = NonNullable<Awaited<ReturnType<typeof sujetoValido>>>;
type Cobertura = { id: number; nombre: string; incluida_en_padre: boolean };

/**
 * Endoso de alta: prima anual por regla y prorrata de los días que faltan. Con `simular` devuelve
 * el detalle sin guardar nada. Si el cálculo está incompleto, solo confirma con el importe de la aseguradora.
 */
export async function altaTx(tx: Tx, periodo: PeriodoConPoliza, usuario: number, sujeto: Sujeto, d: DatosAlta, coberturas: Cobertura[], e: DatosEndoso, simular: boolean): Promise<ResultadoEndoso> {
  const f = e.fecha_efectiva;
  const moneda = periodo.moneda;
  const m = await prepararMotor(tx, periodo.id);
  m.contexto.fecha = f;
  const datos = {
    valor_bien: d.valor_bien === null && sujeto.valor === null ? null : new Decimal(d.valor_bien ?? sujeto.valor!),
    aditamentos: d.aditamentos === null ? null : new Decimal(d.aditamentos),
    suma_asegurada: d.suma_asegurada === null ? null : new Decimal(d.suma_asegurada),
    clase_tarifa: d.clase_tarifa ?? sujeto.clase,
    desde: f,
    hasta: iso(periodo.vigencia_hasta),
  };
  const suma = calcularSuma(m, datos);
  if (suma.resultado) datos.suma_asegurada = suma.suma;
  const lineas = coberturas.map((c) => ({ c, r: calcularPrimaLinea(m, datos, c.id, null) }));
  const faltantes = [...(suma.resultado?.faltantes ?? []), ...lineas.flatMap((l) => l.r.faltantes)];
  const total = lineas.filter((l) => !l.c.incluida_en_padre && l.r.periodo).reduce((s, l) => s.plus(l.r.periodo!), new Decimal(0));
  const dias = diasEntre(f, iso(periodo.vigencia_hasta));

  if (simular) {
    return {
      ok: false,
      aviso: [
        `Simulación del alta de ${sujeto.nombre} desde ${f} (${dias} días hasta el fin de la vigencia):`,
        ...lineas.map((l) => `${l.c.nombre}: ${l.r.anual.valor ? `anual ${formatearImporte(l.r.anual.valor.toFixed(2))} → ${dias} días: ${formatearImporte(l.r.periodo?.toFixed(2) ?? null)}` : `falta ${l.r.faltantes.join(", ")}`}`),
        faltantes.length ? "Cálculo incompleto. Para confirmar, registra el importe de la aseguradora." : `Prima del endoso: ${formatearImporte(total.toFixed(2))} ${moneda}.`,
        "Nada se guardó. Revisa y pulsa «Confirmar endoso».",
      ].join("\n"),
    };
  }
  if (faltantes.length && e.importe_aseguradora === null) throw new Bloqueo(`No se puede confirmar: falta ${[...new Set(faltantes)].join("; ")}. Registra el importe de la aseguradora.`);
  const prima = e.importe_aseguradora ?? total.toFixed(2);

  const en = await tx.endosos.create({
    data: {
      empresa: periodo.empresa, id_periodo: periodo.id, numero: await siguienteEndoso(tx, periodo.id), tipo: "alta", fecha_efectiva: fecha(f), numero_aseguradora: e.numero_aseguradora,
      prima, retroactivo: f < hoyPlanta(), descripcion: `Alta de ${sujeto.nombre} (${coberturas.map((c) => c.nombre).join(", ")})`, motivo: e.motivo, creado_por: usuario,
    },
  });
  const idSuma = suma.resultado ? await guardarCalculo(tx, periodo.empresa, usuario, suma.resultado, "suma_asegurada", moneda, true) : null;
  const inc = await tx.inclusiones.create({
    data: {
      empresa: periodo.empresa, id_periodo: periodo.id, [sujeto.columna]: d.id_sujeto, certificado: d.certificado, ceco: d.ceco, clase_tarifa: datos.clase_tarifa,
      desde: fecha(f), hasta: periodo.vigencia_hasta, valor_bien: datos.valor_bien?.toFixed(2) ?? null, aditamentos: d.aditamentos, suma_asegurada: datos.suma_asegurada?.toFixed(2) ?? null,
      id_calculo_suma: idSuma, id_endoso_alta: en.id, observaciones: d.observaciones, creado_por: usuario,
    },
  });
  for (const l of lineas) {
    const idCalc = await guardarCalculo(tx, periodo.empresa, usuario, l.r.anual, "prima", moneda, true);
    const completa = l.r.anual.valor !== null && l.r.periodo !== null;
    const ic = await tx.inclusion_coberturas.create({
      data: {
        empresa: periodo.empresa, id_inclusion: inc.id, id_cobertura: l.c.id, id_endoso: en.id, id_calculo: idCalc, creado_por: usuario,
        prima_anual: completa ? l.r.anual.valor!.toFixed(2) : null, prima_periodo: completa ? l.r.periodo!.toFixed(2) : null, origen: completa ? "calculada" : null,
      },
    });
    if (completa) {
      await tx.endoso_lineas.create({
        data: {
          empresa: periodo.empresa, id_endoso: en.id, id_inclusion_cobertura: ic.id, prima_anual: l.r.anual.valor!.toFixed(2), dias: l.r.dias, base_dias: l.r.reglaProrrateo?.base_dias ?? null,
          importe: l.r.periodo!.toFixed(2), origen: "calculada", id_regla_prorrateo: l.r.reglaProrrateo?.id ?? null,
        },
      });
    }
  }
  const obligacion = await crearObligacionEndoso(tx, periodo, en.id, en.numero, new Decimal(prima), f, e.vencimiento, usuario, e.numero_aseguradora);
  await registrarGestion(
    usuario,
    MODULO,
    `PERÍODO ${periodo.id} | ENDOSO ${en.numero} ALTA de ${sujeto.nombre} desde ${f}: prima ${prima} ${moneda}${e.importe_aseguradora ? ` (importe de la aseguradora; calculado ${faltantes.length ? "incompleto" : total.toFixed(2)})` : ""}${obligacion}`,
    tx,
    { empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: f < hoyPlanta() ? "ENDOSO RETROACTIVO" : "ENDOSO", motivo: e.motivo },
  );
  return { ok: true, mensaje: `Endoso ${en.numero} confirmado: alta de ${sujeto.nombre}, prima ${formatearImporte(prima)} ${moneda}.` };
}

type InclusionBaja = Prisma.inclusionesGetPayload<{
  include: { inclusion_coberturas: { include: { coberturas: true } }; vehiculos: true; propiedades: true; partes: true };
}>;

/** Incluye lo que necesita `bajaTx` al leer el asegurado. */
export const INCLUIR_BAJA = { inclusion_coberturas: { include: { coberturas: true }, orderBy: { coberturas: { orden: "asc" as const } } }, vehiculos: true, propiedades: true, partes: true };

/** Endoso de baja: devuelve la prima anual de los días restantes (prorrata de baja). */
export async function bajaTx(tx: Tx, periodo: PeriodoConPoliza, usuario: number, inc: InclusionBaja, e: DatosEndoso, simular: boolean): Promise<ResultadoEndoso> {
  const f = e.fecha_efectiva;
  const nombre = inc.vehiculos?.placa ?? inc.propiedades?.nombre ?? (inc.partes ? nombreParte(inc.partes) : "");
  const dias = diasEntre(f, iso(inc.hasta));
  const m = await prepararMotor(tx, periodo.id);
  const lineas = inc.inclusion_coberturas.map((ic) => {
    const regla = elegirRegla(m.reglas, "prorrateo", { ...m.contexto, fecha: f, id_cobertura: ic.id_cobertura, evento: "baja" });
    if (ic.prima_anual === null) return { ic, regla, valor: null, faltante: `prima anual de ${ic.coberturas.nombre} (vino de la aseguradora sin calcular)` };
    const p = prorratear(new Decimal(ic.prima_anual.toString()), dias, regla);
    return { ic, regla, valor: p.valor, faltante: p.faltante };
  });
  const faltantes = lineas.flatMap((l) => (l.faltante ? [l.faltante] : []));
  const devolucion = lineas.filter((l) => !l.ic.coberturas.incluida_en_padre && l.valor).reduce((s, l) => s.plus(l.valor!), new Decimal(0));
  if (simular) {
    return {
      ok: false,
      aviso: [
        `Simulación de la baja de ${nombre} el ${f} (${dias} días sin usar):`,
        ...lineas.map((l) => `${l.ic.coberturas.nombre}: ${l.valor ? `devuelve ${formatearImporte(l.valor.toFixed(2))}` : `falta ${l.faltante}`}`),
        faltantes.length ? "Cálculo incompleto. Para confirmar, registra el importe que devuelve la aseguradora." : `Devolución: ${formatearImporte(devolucion.toFixed(2))} ${periodo.moneda}.`,
        "Nada se guardó. Revisa y pulsa «Confirmar endoso».",
      ].join("\n"),
    };
  }
  if (faltantes.length && e.importe_aseguradora === null) throw new Bloqueo(`No se puede confirmar: falta ${faltantes.join("; ")}. Registra el importe de la aseguradora.`);
  const monto = new Decimal(e.importe_aseguradora ?? devolucion.toFixed(2));
  const en = await tx.endosos.create({
    data: {
      empresa: periodo.empresa, id_periodo: periodo.id, numero: await siguienteEndoso(tx, periodo.id), tipo: "baja", fecha_efectiva: fecha(f), numero_aseguradora: e.numero_aseguradora,
      prima: monto.neg().toFixed(2), retroactivo: f < hoyPlanta(), descripcion: `Baja de ${nombre}`, motivo: e.motivo, creado_por: usuario,
    },
  });
  await tx.inclusiones.update({ where: { id: inc.id }, data: { hasta: fecha(f), id_endoso_baja: en.id } });
  await tx.beneficiarios.updateMany({ where: { id_inclusion: inc.id, hasta: null, desde: { lt: fecha(f) } }, data: { hasta: fecha(f) } });
  for (const l of lineas) {
    if (!l.valor) continue;
    await tx.endoso_lineas.create({
      data: {
        empresa: periodo.empresa, id_endoso: en.id, id_inclusion_cobertura: l.ic.id, prima_anual: l.ic.prima_anual!.toFixed(2), dias, base_dias: l.regla?.base_dias ?? null,
        importe: l.valor.neg().toFixed(2), origen: "calculada", id_regla_prorrateo: l.regla?.id ?? null,
      },
    });
  }
  const obligacion = await crearObligacionEndoso(tx, periodo, en.id, en.numero, monto.neg(), f, e.vencimiento, usuario, e.numero_aseguradora);
  await registrarGestion(
    usuario,
    MODULO,
    `PERÍODO ${periodo.id} | ENDOSO ${en.numero} BAJA de ${nombre} el ${f}: devolución ${monto.toFixed(2)} ${periodo.moneda}${e.importe_aseguradora ? " (importe de la aseguradora)" : ""}${obligacion}`,
    tx,
    { empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: f < hoyPlanta() ? "ENDOSO RETROACTIVO" : "ENDOSO", motivo: e.motivo },
  );
  return { ok: true, mensaje: `Endoso ${en.numero} confirmado: baja de ${nombre}, devolución ${formatearImporte(monto.toFixed(2))} ${periodo.moneda}.` };
}
