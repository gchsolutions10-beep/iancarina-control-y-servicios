import "server-only";
import Decimal from "decimal.js";
import { ajuste } from "@/lib/ajustes";
import { registrarGestion } from "@/lib/auditoria";
import { evaluarNuevoImporte, importesVigentes, numeroExpediente, siguienteConsecutivo, siguienteEtapa, TIPOS_IMPORTE, type TipoImporte } from "@/lib/dominio/siniestros";
import type { Prisma } from "@/lib/generated/prisma/client";
import { nombreParte } from "@/lib/validations/fichas";

/**
 * Núcleo de los siniestros que corre dentro de una transacción (`tx`): lo usan las pantallas
 * (actions/siniestros.ts) y la carga de datos de ejemplo. Toda operación deja su bitácora en el
 * historial del expediente.
 */
type Tx = Prisma.TransactionClient;
const fecha = (v: string) => new Date(`${v}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const MODULO = "SINIESTROS";
const bitacora = (tx: Tx, usuario: number, empresa: string, id: bigint, texto: string, operacion: string, motivo?: string | null) =>
  registrarGestion(usuario, MODULO, texto, tx, { empresa, entidad: "siniestros", idRegistro: id, operacion, motivo });

export class BloqueoSiniestro extends Error {}

export type NuevoSiniestro = {
  empresa: string;
  id_tipo: number;
  fecha_evento: string;
  fecha_notificacion: string;
  lugar: string | null;
  descripcion: string;
  tipo_perdida: string | null;
  moneda: string;
  numero_aseguradora: string | null;
  afectado?: { columna: "id_vehiculo" | "id_persona" | "id_propiedad"; id: bigint; nombre: string; danos: string | null; cobertura: { id_inclusion: bigint; id_cobertura: number; id_periodo: bigint } | null };
  transporte?: { id_transportista: bigint; id_vehiculo: bigint | null; placa_texto: string | null; mercancia: string; guia: string | null; valor_mercancia: string | null; perdida: string | null };
};

/** Crea el expediente con su número SIN-AAAA-NNNN, el afectado (o el transporte) y la primera etapa. */
export async function crearSiniestroTx(tx: Tx, usuario: number, d: NuevoSiniestro) {
  const tipo = await tx.tipos_siniestro.findUniqueOrThrow({ where: { id: d.id_tipo }, include: { flujos: { include: { flujo_etapas: { where: { activo: true } } } } } });
  const anio = Number(d.fecha_notificacion.slice(0, 4));
  // Un solo número por empresa y año aunque dos personas registren a la vez.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cys:siniestro:${d.empresa}:${anio}`}))`;
  const usados = await tx.siniestros.findMany({ where: { empresa: d.empresa, numero_expediente: { startsWith: `SIN-${anio}-` } }, select: { numero_expediente: true } });
  const numero = numeroExpediente(anio, siguienteConsecutivo(anio, usados.map((u) => u.numero_expediente)));
  const s = await tx.siniestros.create({
    data: {
      empresa: d.empresa, numero_expediente: numero, numero_aseguradora: d.numero_aseguradora, id_tipo: tipo.id, id_flujo: tipo.id_flujo, fecha_evento: fecha(d.fecha_evento),
      fecha_notificacion: fecha(d.fecha_notificacion), lugar: d.lugar, descripcion: d.descripcion, tipo_perdida: d.tipo_perdida, moneda: d.moneda,
      id_periodo: d.afectado?.cobertura?.id_periodo ?? null, confidencial: tipo.sujeto === "persona", id_responsable: usuario, creado_por: usuario,
    },
  });
  if (d.afectado) {
    await tx.siniestro_afectados.create({
      data: {
        empresa: d.empresa, id_siniestro: s.id, [d.afectado.columna]: d.afectado.id, id_inclusion: d.afectado.cobertura?.id_inclusion ?? null,
        id_cobertura: d.afectado.cobertura?.id_cobertura ?? null, danos: d.afectado.danos, creado_por: usuario,
      },
    });
  }
  if (d.transporte) await tx.siniestro_transporte.create({ data: { id_siniestro: s.id, empresa: d.empresa, ...d.transporte } });
  const primera = siguienteEtapa(tipo.flujos.flujo_etapas, null);
  if (primera) await tx.siniestro_etapas.create({ data: { empresa: d.empresa, id_siniestro: s.id, id_etapa: primera.id, fecha_inicio: fecha(d.fecha_notificacion), creado_por: usuario } });
  await bitacora(
    tx, usuario, d.empresa, s.id,
    `${numero} | NUEVO: ${tipo.nombre} del ${d.fecha_evento}${d.afectado ? ` · ${d.afectado.nombre}` : ""}${d.transporte ? ` · mercancía: ${d.transporte.mercancia}` : ""}${d.afectado?.cobertura ? " · con póliza vinculada" : ""}`,
    "CREAR",
  );
  return s;
}

/** Cierra la etapa abierta y abre la siguiente del flujo (o termina el flujo). */
export async function avanzarEtapaTx(tx: Tx, usuario: number, idSiniestro: bigint, f: string, observaciones: string | null) {
  const s = await tx.siniestros.findUniqueOrThrow({ where: { id: idSiniestro }, include: { flujos: { include: { flujo_etapas: { where: { activo: true } } } }, siniestro_etapas: { include: { flujo_etapas: true } } } });
  const abierta = s.siniestro_etapas.find((e) => !e.fecha_fin);
  if (abierta && f < iso(abierta.fecha_inicio)) throw new BloqueoSiniestro(`La fecha no puede ser anterior al inicio de la etapa (${iso(abierta.fecha_inicio)}).`);
  const siguiente = siguienteEtapa(s.flujos.flujo_etapas, abierta?.id_etapa ?? null);
  if (abierta) await tx.siniestro_etapas.update({ where: { id: abierta.id }, data: { fecha_fin: fecha(f), observaciones: observaciones ?? abierta.observaciones } });
  if (siguiente && (abierta || s.siniestro_etapas.length === 0)) {
    await tx.siniestro_etapas.create({ data: { empresa: s.empresa, id_siniestro: s.id, id_etapa: siguiente.id, fecha_inicio: fecha(f), creado_por: usuario } });
  }
  await bitacora(tx, usuario, s.empresa, s.id, `${s.numero_expediente} | ETAPA: ${abierta ? `${abierta.flujo_etapas.nombre} terminada el ${f}` : "inicio"}${siguiente ? ` → ${siguiente.nombre}` : " · flujo completo"}`, "ETAPA", observaciones);
  return siguiente?.nombre ?? null;
}

/**
 * Registra un importe (presupuestado, autorizado o reconocido). Si consume un límite del período
 * (riesgos diversos), lo evalúa: avisa desde el porcentaje de Ajustes y bloquea si lo supera.
 */
export async function registrarImporteTx(tx: Tx, usuario: number, idSiniestro: bigint, d: { tipo: TipoImporte; monto: string; fecha: string; referencia: string | null; motivo: string | null }) {
  const s = await tx.siniestros.findUniqueOrThrow({ where: { id: idSiniestro }, include: { siniestro_importes: true, siniestro_afectados: true } });
  const avisos: string[] = [];
  if (s.id_periodo) {
    const avisoPct = await ajuste("siniestros.aviso_limite_pct");
    const limites = await tx.limites.findMany({ where: { id_periodo: s.id_periodo, activo: true, consume: d.tipo } });
    const vigente = (lista: { id: bigint; tipo: string; monto: Prisma.Decimal }[]) => importesVigentes(lista.map((i) => ({ id: Number(i.id), tipo: i.tipo, monto: i.monto.toString() })))[d.tipo] ?? new Decimal(0);
    const actual = vigente(s.siniestro_importes);
    for (const l of limites) {
      if (l.id_cobertura !== null && !s.siniestro_afectados.some((a) => a.id_cobertura === l.id_cobertura)) continue;
      const otros = await tx.siniestros.findMany({
        where: { id_periodo: s.id_periodo, estado: { not: "anulado" }, ...(l.id_cobertura !== null ? { siniestro_afectados: { some: { id_cobertura: l.id_cobertura } } } : {}) },
        include: { siniestro_importes: true, siniestro_afectados: true },
      });
      const nombre = l.descripcion ?? (l.tipo === "agregado_anual" ? "Límite agregado anual" : "Límite por bien");
      const grupos =
        l.tipo === "agregado_anual"
          ? [{ etiqueta: nombre, expedientes: otros }]
          : s.siniestro_afectados
              .filter((a) => a.id_vehiculo || a.id_propiedad || a.id_persona)
              .map((a) => ({
                etiqueta: `${nombre} (bien afectado)`,
                expedientes: otros.filter((o) => o.siniestro_afectados.some((x) => (a.id_vehiculo && x.id_vehiculo === a.id_vehiculo) || (a.id_propiedad && x.id_propiedad === a.id_propiedad) || (a.id_persona && x.id_persona === a.id_persona))),
              }));
      for (const g of grupos) {
        const total = g.expedientes.reduce((sum, o) => sum.plus(vigente(o.siniestro_importes)), new Decimal(0));
        const actualAqui = g.expedientes.some((o) => o.id === s.id) ? actual : new Decimal(0);
        const r = evaluarNuevoImporte({ descripcion: g.etiqueta, monto: l.monto.toString(), moneda: s.moneda }, total, actualAqui, d.monto, avisoPct);
        if (!r.permitido) throw new BloqueoSiniestro(r.aviso!);
        if (r.aviso) avisos.push(r.aviso);
      }
    }
  }
  await tx.siniestro_importes.create({ data: { empresa: s.empresa, id_siniestro: s.id, tipo: d.tipo, monto: d.monto, fecha: fecha(d.fecha), referencia: d.referencia, motivo: d.motivo, creado_por: usuario } });
  const anterior = importesVigentes(s.siniestro_importes.map((i) => ({ id: Number(i.id), tipo: i.tipo, monto: i.monto.toString() })))[d.tipo];
  await bitacora(tx, usuario, s.empresa, s.id, `${s.numero_expediente} | ${TIPOS_IMPORTE[d.tipo].toUpperCase()}: ${anterior ? `${anterior.toFixed(2)} -> ` : ""}${d.monto} ${s.moneda}${d.referencia ? ` ref. ${d.referencia}` : ""}`, "IMPORTE", d.motivo);
  return avisos;
}

/**
 * Cuenta por cobrar del reembolso (obligación por cobrar). Reconocido ≠ cobrado: lo cobrado sale de
 * los pagos imputados a esta obligación; cerrar el expediente no la cierra.
 */
export async function generarCobroTx(tx: Tx, usuario: number, idSiniestro: bigint, d: { id_contraparte: bigint; monto: string; fecha_emision: string; fecha_vencimiento: string; documento: string | null }) {
  const s = await tx.siniestros.findUniqueOrThrow({ where: { id: idSiniestro } });
  const parte = await tx.partes.findUniqueOrThrow({ where: { id: d.id_contraparte } });
  if (parte.empresa !== s.empresa) throw new BloqueoSiniestro("La contraparte debe ser de la misma empresa.");
  const o = await tx.obligaciones.create({
    data: {
      empresa: s.empresa, naturaleza: "por_cobrar", concepto: "reembolso_siniestro", id_contraparte: d.id_contraparte, id_siniestro: s.id, moneda: s.moneda,
      fecha_emision: fecha(d.fecha_emision), fecha_vencimiento: fecha(d.fecha_vencimiento < d.fecha_emision ? d.fecha_emision : d.fecha_vencimiento), documento: d.documento,
      descripcion: `Reembolso del siniestro ${s.numero_expediente}`, creado_por: usuario,
    },
  });
  await tx.obligacion_movimientos.create({ data: { empresa: s.empresa, id_obligacion: o.id, tipo: "cargo", monto: d.monto, fecha: fecha(d.fecha_emision), motivo: `Reembolso reconocido del siniestro ${s.numero_expediente}`, creado_por: usuario } });
  await bitacora(tx, usuario, s.empresa, s.id, `${s.numero_expediente} | CUENTA POR COBRAR ${d.monto} ${s.moneda} a ${nombreParte(parte)} (obligación ${o.id})`, "POR COBRAR");
  return o;
}
