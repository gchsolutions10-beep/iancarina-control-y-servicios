import "server-only";
import Decimal from "decimal.js";
import { ajuste } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { consumoLimite, estadoControl, importesVigentes, type EstadoControl, type TipoImporte } from "@/lib/dominio/siniestros";
import { saldosDe } from "@/lib/finanzas/datos";
import type { Prisma } from "@/lib/generated/prisma/client";
import { hoyPlanta } from "@/lib/tiempo";
import { nombreParte } from "@/lib/validations/fichas";

/**
 * Consultas de siniestros (Etapa 4). Las listas reciben las empresas visibles y las empresas donde el
 * usuario ve datos personales: los expedientes confidenciales (personas) se muestran sin detalle a
 * quien no tiene ese permiso.
 */
const n = (v: bigint) => Number(v);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const txt = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? null : v.toString());
export const POR_PAGINA = 25;

export const SUJETOS_SINIESTRO = { vehiculo: "Vehículo", persona: "Persona", propiedad: "Propiedad", transporte: "Transporte contratado" } as const;
export type SujetoSiniestro = keyof typeof SUJETOS_SINIESTRO;

export const ESTADOS_CONTROL: Record<EstadoControl, string> = {
  sin_movimiento: "Sin movimiento",
  abierto: "Abiertos",
  por_cobrar: "Cerrados por cobrar",
  cerrado: "Cerrados",
  anulado: "Anulados",
};

const PARTE = { select: { tipo: true, nombres: true, apellidos: true, razon_social: true } } as const;
const AFECTADO = {
  include: {
    partes: PARTE,
    vehiculos: { select: { placa: true, modelos: { select: { nombre: true, marcas: { select: { nombre: true } } } } } },
    propiedades: { select: { nombre: true } },
  },
} as const;
type AfectadoBD = Prisma.siniestro_afectadosGetPayload<typeof AFECTADO>;
const nombreAfectado = (a: AfectadoBD) =>
  a.vehiculos ? `${a.vehiculos.placa}${a.vehiculos.modelos ? ` · ${a.vehiculos.modelos.marcas.nombre} ${a.vehiculos.modelos.nombre}` : ""}` : a.propiedades ? a.propiedades.nombre : a.partes ? nombreParte(a.partes) : "Mercancía de terceros";

export async function tiposSiniestro(soloActivos = true) {
  return db.tipos_siniestro.findMany({ where: soloActivos ? { activo: true } : {}, orderBy: [{ sujeto: "asc" }, { nombre: "asc" }], include: { flujos: { select: { nombre: true } } } });
}

/** Última actividad del expediente: alta, etapas, actuaciones o importes. */
const ultimaActividad = (s: { creado_en: Date; siniestro_etapas: { fecha_inicio: Date; fecha_fin: Date | null }[]; siniestro_actuaciones: { fecha: Date }[]; siniestro_importes: { fecha: Date }[] }) =>
  [iso(s.creado_en), ...s.siniestro_etapas.flatMap((e) => [iso(e.fecha_inicio), e.fecha_fin ? iso(e.fecha_fin) : ""]), ...s.siniestro_actuaciones.map((a) => iso(a.fecha)), ...s.siniestro_importes.map((i) => iso(i.fecha))].sort().at(-1)!;

/** Saldo por cobrar del reembolso de cada expediente (Σ saldos de sus obligaciones vigentes). */
async function porCobrar(ids: bigint[]) {
  if (!ids.length) return new Map<string, { monto: Decimal; cobrado: Decimal; saldo: Decimal }>();
  const obligaciones = await db.obligaciones.findMany({ where: { id_siniestro: { in: ids }, estado: "vigente" }, select: { id: true, id_siniestro: true } });
  const saldos = await saldosDe(obligaciones.map((o) => o.id));
  const r = new Map<string, { monto: Decimal; cobrado: Decimal; saldo: Decimal }>();
  for (const o of obligaciones) {
    const s = saldos.get(o.id.toString())!;
    const k = o.id_siniestro!.toString();
    const a = r.get(k) ?? { monto: new Decimal(0), cobrado: new Decimal(0), saldo: new Decimal(0) };
    r.set(k, { monto: a.monto.plus(s.monto), cobrado: a.cobrado.plus(s.imputado), saldo: a.saldo.plus(s.saldo) });
  }
  return r;
}

export type FiltroSiniestros = { empresas: string[]; sensibles: string[]; q: string; estado: string; tipo: string; sujeto: string; pagina: number };

export async function listarSiniestros(f: FiltroSiniestros) {
  const q = f.q.trim();
  const dias = await ajuste("siniestros.dias_sin_movimiento");
  const hoy = hoyPlanta();
  const where: Prisma.siniestrosWhereInput = {
    empresa: { in: f.empresas },
    ...(f.tipo ? { id_tipo: Number(f.tipo) || 0 } : {}),
    ...(f.sujeto ? { tipos_siniestro: { sujeto: f.sujeto } } : {}),
    ...(q
      ? {
          OR: [
            { numero_expediente: { contains: q, mode: "insensitive" } },
            { numero_aseguradora: { contains: q, mode: "insensitive" } },
            { siniestro_afectados: { some: { vehiculos: { placa_normalizada: { contains: q.replace(/[^A-Za-z0-9]/g, "").toUpperCase() } } } } },
            // La descripción de los confidenciales solo se busca donde el usuario ve datos personales.
            { descripcion: { contains: q, mode: "insensitive" }, OR: [{ confidencial: false }, { empresa: { in: f.sensibles } }] },
          ],
        }
      : {}),
  };
  const filas = await db.siniestros.findMany({
    where,
    orderBy: [{ fecha_evento: "desc" }, { id: "desc" }],
    include: {
      tipos_siniestro: { select: { nombre: true, sujeto: true } },
      siniestro_afectados: { ...AFECTADO, orderBy: { id: "asc" }, take: 2 },
      siniestro_transporte: { select: { mercancia: true, partes: PARTE } },
      siniestro_etapas: { select: { fecha_inicio: true, fecha_fin: true, flujo_etapas: { select: { nombre: true } } }, orderBy: { id: "asc" } },
      siniestro_actuaciones: { select: { fecha: true } },
      siniestro_importes: { select: { id: true, tipo: true, monto: true, fecha: true } },
    },
  });
  const cobros = await porCobrar(filas.map((s) => s.id));
  const todas = filas.map((s) => {
    const reservado = s.confidencial && !f.sensibles.includes(s.empresa);
    const cobro = cobros.get(s.id.toString());
    const vigentes = importesVigentes(s.siniestro_importes.map((i) => ({ id: n(i.id), tipo: i.tipo, monto: i.monto.toString() })));
    const abierta = s.siniestro_etapas.find((e) => !e.fecha_fin);
    return {
      id: n(s.id),
      empresa: s.empresa,
      numero: s.numero_expediente,
      tipo: s.tipos_siniestro.nombre,
      sujeto: s.tipos_siniestro.sujeto as SujetoSiniestro,
      fecha: iso(s.fecha_evento),
      afectado: reservado
        ? "Confidencial"
        : s.siniestro_transporte[0]
          ? `${s.siniestro_transporte[0].mercancia} · ${nombreParte(s.siniestro_transporte[0].partes)}`
          : s.siniestro_afectados.map(nombreAfectado).join(", ") || "—",
      etapa: abierta?.flujo_etapas.nombre ?? (s.estado === "abierto" ? "—" : "Finalizado"),
      moneda: s.moneda,
      reconocido: vigentes.reconocido?.toFixed(2) ?? null,
      saldoPorCobrar: cobro?.saldo.toFixed(2) ?? null,
      confidencial: s.confidencial,
      estado: estadoControl({ estado: s.estado, ultimaActividad: ultimaActividad(s), saldoPorCobrar: cobro?.saldo ?? 0 }, hoy, dias),
    };
  });
  const conteo = todas.reduce<Record<string, number>>((c, x) => ((c[x.estado] = (c[x.estado] ?? 0) + 1), c), {});
  const filtradas = f.estado ? todas.filter((x) => x.estado === f.estado) : todas;
  return { total: filtradas.length, conteo, dias, filas: filtradas.slice((f.pagina - 1) * POR_PAGINA, f.pagina * POR_PAGINA) };
}

export async function obtenerSiniestro(id: number) {
  const s = await db.siniestros.findUnique({
    where: { id: BigInt(id) },
    include: {
      tipos_siniestro: true,
      flujos: { include: { flujo_etapas: { where: { activo: true }, orderBy: { orden: "asc" } } } },
      siniestro_afectados: {
        ...AFECTADO,
        orderBy: { id: "asc" },
        include: {
          ...AFECTADO.include,
          coberturas: { select: { nombre: true } },
          inclusiones: { select: { certificado: true, poliza_periodos: { select: { id: true, numero_periodo: true, polizas: { select: { numero: true } } } } } },
        },
      },
      siniestro_transporte: { include: { partes: PARTE, vehiculos: { select: { placa: true } } } },
      siniestro_etapas: { orderBy: { id: "asc" }, include: { flujo_etapas: true, app_usuarios: { select: { nombre_apellido: true } } } },
      siniestro_actuaciones: { orderBy: [{ fecha: "desc" }, { id: "desc" }], include: { app_usuarios: { select: { nombre_apellido: true } } } },
      siniestro_importes: { orderBy: { id: "desc" }, include: { app_usuarios: { select: { nombre_apellido: true } } } },
      poliza_periodos: { select: { id: true, numero_periodo: true, polizas: { select: { numero: true, id_aseguradora: true, partes: { select: { razon_social: true } } } } } },
      documentos: { where: { retirado: false }, select: { tipo_documento: true } },
    },
  });
  if (!s) return null;
  const cobro = (await porCobrar([s.id])).get(s.id.toString());
  const dias = await ajuste("siniestros.dias_sin_movimiento");
  const vigentes = importesVigentes(s.siniestro_importes.map((i) => ({ id: n(i.id), tipo: i.tipo, monto: i.monto.toString() })));
  return {
    id: n(s.id),
    empresa: s.empresa,
    numero: s.numero_expediente,
    numero_aseguradora: s.numero_aseguradora,
    tipo: { id: s.id_tipo, nombre: s.tipos_siniestro.nombre, sujeto: s.tipos_siniestro.sujeto as SujetoSiniestro },
    flujo: s.flujos.nombre,
    etapasFlujo: s.flujos.flujo_etapas.map((e) => ({ id: e.id, orden: e.orden, nombre: e.nombre, documentos: e.documentos_requeridos })),
    fecha_evento: iso(s.fecha_evento),
    fecha_notificacion: iso(s.fecha_notificacion),
    lugar: s.lugar,
    descripcion: s.descripcion,
    tipo_perdida: s.tipo_perdida,
    moneda: s.moneda,
    confidencial: s.confidencial,
    estado: s.estado as "abierto" | "cerrado" | "anulado",
    estadoControl: estadoControl({ estado: s.estado, ultimaActividad: ultimaActividad(s), saldoPorCobrar: cobro?.saldo ?? 0 }, hoyPlanta(), dias),
    cerrado_en: s.cerrado_en ? iso(s.cerrado_en) : null,
    motivo_cierre: s.motivo_cierre,
    poliza: s.poliza_periodos
      ? { id_periodo: n(s.poliza_periodos.id), numero: s.poliza_periodos.polizas.numero, periodo: s.poliza_periodos.numero_periodo, aseguradora: s.poliza_periodos.polizas.partes.razon_social ?? "", id_aseguradora: n(s.poliza_periodos.polizas.id_aseguradora) }
      : null,
    afectados: s.siniestro_afectados.map((a) => ({
      id: n(a.id),
      tipo: a.id_vehiculo ? ("vehiculo" as const) : a.id_propiedad ? ("propiedad" as const) : a.id_persona ? ("persona" as const) : null,
      id_sujeto: a.id_vehiculo ? n(a.id_vehiculo) : a.id_propiedad ? n(a.id_propiedad) : a.id_persona ? n(a.id_persona) : null,
      nombre: nombreAfectado(a),
      danos: a.danos,
      cobertura: a.coberturas?.nombre ?? null,
      poliza: a.inclusiones ? { id_periodo: n(a.inclusiones.poliza_periodos.id), numero: a.inclusiones.poliza_periodos.polizas.numero, periodo: a.inclusiones.poliza_periodos.numero_periodo, certificado: a.inclusiones.certificado } : null,
    })),
    transporte: s.siniestro_transporte[0]
      ? {
          transportista: nombreParte(s.siniestro_transporte[0].partes),
          id_transportista: n(s.siniestro_transporte[0].id_transportista),
          placa: s.siniestro_transporte[0].vehiculos?.placa ?? s.siniestro_transporte[0].placa_texto,
          propio: s.siniestro_transporte[0].id_vehiculo !== null,
          mercancia: s.siniestro_transporte[0].mercancia,
          guia: s.siniestro_transporte[0].guia,
          valor: txt(s.siniestro_transporte[0].valor_mercancia),
          perdida: txt(s.siniestro_transporte[0].perdida),
        }
      : null,
    etapas: s.siniestro_etapas.map((e) => ({ id: n(e.id), id_etapa: e.id_etapa, nombre: e.flujo_etapas.nombre, documentos: e.flujo_etapas.documentos_requeridos, inicio: iso(e.fecha_inicio), fin: e.fecha_fin ? iso(e.fecha_fin) : null, observaciones: e.observaciones, usuario: e.app_usuarios.nombre_apellido })),
    actuaciones: s.siniestro_actuaciones.map((a) => ({ id: n(a.id), fecha: iso(a.fecha), descripcion: a.descripcion, usuario: a.app_usuarios.nombre_apellido })),
    importes: s.siniestro_importes.map((i) => ({ id: n(i.id), tipo: i.tipo as TipoImporte, monto: i.monto.toFixed(2), fecha: iso(i.fecha), referencia: i.referencia, motivo: i.motivo, usuario: i.app_usuarios.nombre_apellido })),
    vigentes: Object.fromEntries(Object.entries(vigentes).map(([k, v]) => [k, v!.toFixed(2)])) as Partial<Record<TipoImporte, string>>,
    cobro: cobro ? { monto: cobro.monto.toFixed(2), cobrado: cobro.cobrado.toFixed(2), saldo: cobro.saldo.toFixed(2) } : null,
    tiposDocumento: s.documentos.map((d) => d.tipo_documento),
  };
}

export type Siniestro = NonNullable<Awaited<ReturnType<typeof obtenerSiniestro>>>;

/** Cuentas por cobrar del expediente con su saldo. */
export async function obligacionesSiniestro(id: number) {
  const filas = await db.obligaciones.findMany({ where: { id_siniestro: BigInt(id) }, orderBy: { id: "asc" }, include: { partes: { select: { razon_social: true } } } });
  const saldos = await saldosDe(filas.map((o) => o.id));
  return filas.map((o) => {
    const { monto, imputado, saldo } = saldos.get(o.id.toString())!;
    return { id: n(o.id), contraparte: o.partes.razon_social ?? "", vencimiento: iso(o.fecha_vencimiento), estado: o.estado, documento: o.documento, monto, imputado, saldo };
  });
}

/**
 * Pólizas con que puede responder un afectado: inclusiones del sujeto en períodos confirmados que
 * cubrían la fecha del evento (vínculo explícito; nunca se asigna solo).
 */
export async function opcionesCobertura(empresa: string, sujeto: { vehiculo?: bigint; persona?: bigint; propiedad?: bigint }, fechaEvento: string) {
  const f = new Date(`${fechaEvento}T00:00:00Z`);
  const filas = await db.inclusiones.findMany({
    where: {
      empresa,
      ...(sujeto.vehiculo ? { id_vehiculo: sujeto.vehiculo } : sujeto.persona ? { id_persona: sujeto.persona } : { id_propiedad: sujeto.propiedad ?? BigInt(0) }),
      desde: { lte: f },
      hasta: { gt: f },
      poliza_periodos: { estado: "confirmado" },
    },
    include: { inclusion_coberturas: { include: { coberturas: { select: { nombre: true } } } }, poliza_periodos: { select: { numero_periodo: true, polizas: { select: { numero: true, partes: { select: { razon_social: true } } } } } } },
  });
  return filas.flatMap((i) =>
    i.inclusion_coberturas.map((c) => ({
      valor: `${i.id}:${c.id_cobertura}`,
      etiqueta: `Póliza ${i.poliza_periodos.polizas.numero} (${i.poliza_periodos.polizas.partes.razon_social}) · ${c.coberturas.nombre}${i.certificado ? ` · cert. ${i.certificado}` : ""}`,
    })),
  );
}

// ---------------------------------------------------------------- límites
type Afect = { id_siniestro: bigint; id_cobertura: number | null; id_vehiculo: bigint | null; id_persona: bigint | null; id_propiedad: bigint | null };
const claveBien = (a: Afect) => (a.id_vehiculo ? `v${a.id_vehiculo}` : a.id_propiedad ? `p${a.id_propiedad}` : a.id_persona ? `h${a.id_persona}` : null);

/**
 * Consumo de los límites de un período: Σ del importe vigente que consume cada límite (reconocido por
 * defecto) de los expedientes no anulados vinculados al período. Por bien: agrupado por vehículo,
 * propiedad o persona afectada.
 */
export async function limitesConConsumo(idPeriodo: bigint) {
  const avisoPct = await ajuste("siniestros.aviso_limite_pct");
  const [limites, siniestros] = await Promise.all([
    db.limites.findMany({ where: { id_periodo: idPeriodo, activo: true }, orderBy: { id: "asc" }, include: { coberturas: { select: { nombre: true } }, poliza_periodos: { select: { moneda: true } } } }),
    db.siniestros.findMany({
      where: { id_periodo: idPeriodo, estado: { not: "anulado" } },
      select: { id: true, numero_expediente: true, siniestro_importes: { select: { id: true, tipo: true, monto: true } }, siniestro_afectados: { select: { id_siniestro: true, id_cobertura: true, id_vehiculo: true, id_persona: true, id_propiedad: true, vehiculos: { select: { placa: true } }, propiedades: { select: { nombre: true } }, partes: PARTE } } },
    }),
  ]);
  return limites.map((l) => {
    const aplica = siniestros.filter((s) => l.id_cobertura === null || s.siniestro_afectados.some((a) => a.id_cobertura === l.id_cobertura));
    const importe = (s: (typeof siniestros)[number]) => importesVigentes(s.siniestro_importes.map((i) => ({ id: n(i.id), tipo: i.tipo, monto: i.monto.toString() })))[l.consume as TipoImporte] ?? new Decimal(0);
    const base = { id: n(l.id), tipo: l.tipo as "agregado_anual" | "por_bien", cobertura: l.coberturas?.nombre ?? null, consume: l.consume, descripcion: l.descripcion, moneda: l.poliza_periodos.moneda, id_cobertura: l.id_cobertura };
    if (l.tipo === "agregado_anual") {
      const c = consumoLimite(l.monto.toString(), aplica.map(importe), avisoPct);
      return { ...base, ...serial(c), expedientes: aplica.map((s) => ({ id: n(s.id), numero: s.numero_expediente, importe: importe(s).toFixed(2) })), porBien: [] as { bien: string; consumo: ReturnType<typeof serial> }[] };
    }
    const grupos = new Map<string, { bien: string; montos: Decimal[] }>();
    for (const s of aplica) {
      for (const a of s.siniestro_afectados) {
        const k = claveBien(a);
        if (!k) continue;
        const nombre = a.vehiculos?.placa ?? a.propiedades?.nombre ?? (a.partes ? nombreParte(a.partes) : k);
        const g = grupos.get(k) ?? { bien: nombre, montos: [] };
        g.montos.push(importe(s));
        grupos.set(k, g);
      }
    }
    const porBien = [...grupos.values()].map((g) => ({ bien: g.bien, consumo: serial(consumoLimite(l.monto.toString(), g.montos, avisoPct)) }));
    const peor = porBien.reduce<ReturnType<typeof serial> | null>((p, b) => (!p || Number(b.consumo.porcentaje) > Number(p.porcentaje) ? b.consumo : p), null);
    return { ...base, ...(peor ?? serial(consumoLimite(l.monto.toString(), [], avisoPct))), expedientes: [], porBien };
  });
}

const serial = (c: ReturnType<typeof consumoLimite>) => ({ monto: c.monto.toFixed(2), consumido: c.consumido.toFixed(2), disponible: c.disponible.toFixed(2), porcentaje: c.porcentaje.toFixed(2), estado: c.estado });

/** Siniestros de una ficha (persona, vehículo o propiedad), sin detalle si es confidencial y no puede verlo. */
export async function siniestrosDe(empresa: string, ficha: { persona?: number; vehiculo?: number; propiedad?: number }, sensibles: boolean) {
  const filas = await db.siniestros.findMany({
    where: {
      empresa,
      siniestro_afectados: {
        some: ficha.persona ? { id_persona: BigInt(ficha.persona) } : ficha.vehiculo ? { id_vehiculo: BigInt(ficha.vehiculo) } : { id_propiedad: BigInt(ficha.propiedad ?? 0) },
      },
    },
    orderBy: { fecha_evento: "desc" },
    include: { tipos_siniestro: { select: { nombre: true } } },
  });
  return filas.map((s) => ({ id: n(s.id), numero: s.numero_expediente, tipo: s.tipos_siniestro.nombre, fecha: iso(s.fecha_evento), estado: s.estado, reservado: s.confidencial && !sensibles }));
}
