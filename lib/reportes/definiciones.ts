import "server-only";
import Decimal from "decimal.js";
import { ajuste } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { importesVigentes } from "@/lib/dominio/siniestros";
import { estadoObligacion } from "@/lib/dominio/saldos";
import { diasEntre, estadoVigencia } from "@/lib/dominio/vigencias";
import { saldosDe, ESTADOS_PAGO } from "@/lib/finanzas/datos";
import { ESTADOS_VIGENCIA, resumenPeriodo } from "@/lib/polizas/datos";
import { SUJETOS_SINIESTRO } from "@/lib/siniestros/datos";
import { nombreParte } from "@/lib/validations/fichas";
import { tramoVencimiento, type Filtro, type Resultado, type Valor } from "./tipos";

/**
 * Reportes del sistema (Reportes → Reportes). Cada uno: filtros (en la URL), consulta limitada a las
 * empresas del usuario y columnas tipadas. La misma consulta alimenta la pantalla, Excel e impresión.
 * Los siniestros confidenciales salen sin afectado ni descripción a quien no ve datos personales.
 */

export type Contexto = { empresas: string[]; sensibles: string[]; nombreEmpresa: (c: string) => string; hoy: string; opcionesEmpresa: { valor: string; etiqueta: string }[] };

export type Reporte = {
  id: string;
  titulo: string;
  descripcion: string;
  filtros: (ctx: Contexto) => Promise<Filtro[]>;
  consultar: (ctx: Contexto, v: Record<string, string>) => Promise<Resultado>;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const txt = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? null : new Decimal(v.toString()).toFixed(2));
const empresasDe = (ctx: Contexto, v: Record<string, string>) => (v.empresa && ctx.empresas.includes(v.empresa) ? [v.empresa] : ctx.empresas);
const filtroEmpresa = (ctx: Contexto): Filtro[] => (ctx.opcionesEmpresa.length > 1 ? [{ clave: "empresa", etiqueta: "Empresa", tipo: "lista", opciones: ctx.opcionesEmpresa, todos: "Todas" }] : []);
const opcionesRamos = async () => (await db.ramos.findMany({ orderBy: { nombre: "asc" } })).map((r) => ({ valor: String(r.id), etiqueta: r.nombre }));
const aseguradoras = async (empresas: string[]) =>
  (await db.partes.findMany({ where: { empresa: { in: empresas }, estado: { not: "fusionada" }, funciones: { has: "Aseguradora" } }, orderBy: { razon_social: "asc" }, select: { id: true, razon_social: true } })).map((p) => ({ valor: String(p.id), etiqueta: p.razon_social ?? "" }));

// ---------------------------------------------------------------- pólizas y vigencias
const polizas: Reporte = {
  id: "polizas",
  titulo: "Pólizas y vigencias",
  descripcion: "Cada vigencia con su estado, asegurados, suma asegurada y prima neta (inicial + endosos).",
  filtros: async (ctx) => [
    ...filtroEmpresa(ctx),
    { clave: "aseguradora", etiqueta: "Aseguradora", tipo: "lista", opciones: await aseguradoras(ctx.empresas), todos: "Todas" },
    { clave: "ramo", etiqueta: "Ramo", tipo: "lista", opciones: await opcionesRamos(), todos: "Todos" },
    { clave: "estado", etiqueta: "Estado", tipo: "lista", opciones: (["vigente", "por_vencer", "vencido", "futuro", "borrador", "anulado"] as const).map((e) => ({ valor: e, etiqueta: ESTADOS_VIGENCIA[e] })), todos: "Todos" },
    { clave: "vence_desde", etiqueta: "Vence desde", tipo: "fecha" },
    { clave: "vence_hasta", etiqueta: "Vence hasta", tipo: "fecha" },
  ],
  consultar: async (ctx, v) => {
    const dias = await ajuste("polizas.dias_por_vencer");
    const periodos = await db.poliza_periodos.findMany({
      where: {
        empresa: { in: empresasDe(ctx, v) },
        ...(v.vence_desde || v.vence_hasta ? { vigencia_hasta: { ...(v.vence_desde ? { gte: new Date(`${v.vence_desde}T00:00:00Z`) } : {}), ...(v.vence_hasta ? { lte: new Date(`${v.vence_hasta}T00:00:00Z`) } : {}) } } : {}),
        polizas: { ...(v.aseguradora ? { id_aseguradora: BigInt(v.aseguradora) } : {}), ...(v.ramo ? { id_ramo: Number(v.ramo) } : {}) },
      },
      orderBy: [{ vigencia_hasta: "asc" }],
      include: { polizas: { include: { partes: { select: { razon_social: true } }, ramos: { select: { nombre: true } } } } },
    });
    const filas: Valor[][] = [];
    const enlaces: string[] = [];
    for (const p of periodos) {
      const estado = estadoVigencia({ estado: p.estado, desde: iso(p.vigencia_desde), hasta: iso(p.vigencia_hasta) }, ctx.hoy, dias);
      if (v.estado && estado !== v.estado) continue;
      const r = await resumenPeriodo(p.id);
      filas.push([ctx.nombreEmpresa(p.empresa), p.polizas.numero, p.polizas.partes.razon_social, p.polizas.ramos.nombre, p.numero_periodo, iso(p.vigencia_desde), iso(p.vigencia_hasta), ESTADOS_VIGENCIA[estado], r.asegurados, r.sumaAsegurada, r.primaTotal, p.moneda]);
      enlaces.push(`/polizas/periodos/${p.id}`);
    }
    return {
      columnas: [
        { titulo: "Empresa", tipo: "texto" }, { titulo: "Póliza", tipo: "texto" }, { titulo: "Aseguradora", tipo: "texto" }, { titulo: "Ramo", tipo: "texto" }, { titulo: "Período", tipo: "entero" },
        { titulo: "Desde", tipo: "fecha" }, { titulo: "Hasta", tipo: "fecha" }, { titulo: "Estado", tipo: "texto" }, { titulo: "Asegurados", tipo: "entero" }, { titulo: "Suma asegurada", tipo: "importe" },
        { titulo: "Prima neta", tipo: "importe" }, { titulo: "Moneda", tipo: "texto" },
      ],
      filas,
      enlaces,
      moneda: 11,
    };
  },
};

// ---------------------------------------------------------------- asegurados
const asegurados: Reporte = {
  id: "asegurados",
  titulo: "Asegurados por póliza",
  descripcion: "Quién o qué está asegurado a una fecha de corte, con su suma asegurada y prima del período.",
  filtros: async (ctx) => [
    ...filtroEmpresa(ctx),
    { clave: "corte", etiqueta: "Al", tipo: "fecha" },
    { clave: "ramo", etiqueta: "Ramo", tipo: "lista", opciones: await opcionesRamos(), todos: "Todos" },
    { clave: "tipo", etiqueta: "Asegurado", tipo: "lista", opciones: [{ valor: "vehiculo", etiqueta: "Vehículos" }, { valor: "persona", etiqueta: "Personas" }, { valor: "propiedad", etiqueta: "Propiedades" }], todos: "Todos" },
    { clave: "q", etiqueta: "Buscar", tipo: "texto", placeholder: "Póliza, placa, nombre o CECO" },
  ],
  consultar: async (ctx, v) => {
    const corte = new Date(`${v.corte ?? ctx.hoy}T00:00:00Z`);
    const q = (v.q ?? "").toLowerCase();
    const filas = await db.inclusiones.findMany({
      where: {
        empresa: { in: empresasDe(ctx, v) },
        desde: { lte: corte },
        hasta: { gt: corte },
        poliza_periodos: { estado: "confirmado", ...(v.ramo ? { polizas: { id_ramo: Number(v.ramo) } } : {}) },
        ...(v.tipo === "vehiculo" ? { id_vehiculo: { not: null } } : v.tipo === "persona" ? { id_persona: { not: null } } : v.tipo === "propiedad" ? { id_propiedad: { not: null } } : {}),
      },
      orderBy: [{ id_periodo: "asc" }, { id: "asc" }],
      include: {
        partes: { select: { tipo: true, nombres: true, apellidos: true, razon_social: true } },
        vehiculos: { select: { placa: true } },
        propiedades: { select: { nombre: true } },
        inclusion_coberturas: { select: { prima_periodo: true, coberturas: { select: { incluida_en_padre: true } } } },
        poliza_periodos: { select: { id: true, moneda: true, polizas: { select: { numero: true, ramos: { select: { nombre: true } } } } } },
      },
    });
    const r: Valor[][] = [];
    const enlaces: string[] = [];
    for (const i of filas) {
      const nombre = i.vehiculos?.placa ?? i.propiedades?.nombre ?? (i.partes ? nombreParte(i.partes) : "");
      if (q && ![i.poliza_periodos.polizas.numero, nombre, i.ceco ?? ""].some((x) => x.toLowerCase().includes(q))) continue;
      const prima = i.inclusion_coberturas.filter((c) => !c.coberturas.incluida_en_padre && c.prima_periodo).reduce((s, c) => s.plus(c.prima_periodo!.toString()), new Decimal(0));
      r.push([ctx.nombreEmpresa(i.empresa), i.poliza_periodos.polizas.numero, i.poliza_periodos.polizas.ramos.nombre, nombre, i.id_vehiculo ? "Vehículo" : i.id_propiedad ? "Propiedad" : "Persona", i.certificado, i.ceco, iso(i.desde), iso(i.hasta), txt(i.suma_asegurada), prima.toFixed(2), i.poliza_periodos.moneda]);
      enlaces.push(`/polizas/periodos/${i.poliza_periodos.id}`);
    }
    return {
      columnas: [
        { titulo: "Empresa", tipo: "texto" }, { titulo: "Póliza", tipo: "texto" }, { titulo: "Ramo", tipo: "texto" }, { titulo: "Asegurado", tipo: "texto" }, { titulo: "Tipo", tipo: "texto" },
        { titulo: "Certificado", tipo: "texto" }, { titulo: "CECO", tipo: "texto" }, { titulo: "Desde", tipo: "fecha" }, { titulo: "Hasta", tipo: "fecha" }, { titulo: "Suma asegurada", tipo: "importe" },
        { titulo: "Prima del período", tipo: "importe" }, { titulo: "Moneda", tipo: "texto" },
      ],
      filas: r,
      enlaces,
      moneda: 11,
    };
  },
};

// ---------------------------------------------------------------- detalle por CECO
const ceco: Reporte = {
  id: "ceco",
  titulo: "Detalle por CECO",
  descripcion: "Primas de las vigencias confirmadas a una fecha, por centro de costo y cobertura (prima neta: inicial y altas, menos devoluciones por bajas).",
  filtros: async (ctx) => [...filtroEmpresa(ctx), { clave: "corte", etiqueta: "Vigencias al", tipo: "fecha" }, { clave: "ramo", etiqueta: "Ramo", tipo: "lista", opciones: await opcionesRamos(), todos: "Todos" }],
  consultar: async (ctx, v) => {
    const corte = new Date(`${v.corte ?? ctx.hoy}T00:00:00Z`);
    const where = {
      empresa: { in: empresasDe(ctx, v) },
      estado: "confirmado",
      vigencia_desde: { lte: corte },
      vigencia_hasta: { gt: corte },
      ...(v.ramo ? { polizas: { id_ramo: Number(v.ramo) } } : {}),
    };
    const [lineas, devoluciones] = await Promise.all([
      db.inclusion_coberturas.findMany({
        where: { inclusiones: { poliza_periodos: where }, coberturas: { incluida_en_padre: false }, prima_periodo: { not: null } },
        select: { prima_periodo: true, id_inclusion: true, coberturas: { select: { nombre: true } }, inclusiones: { select: { empresa: true, ceco: true, poliza_periodos: { select: { moneda: true } } } } },
      }),
      db.endoso_lineas.findMany({
        where: { endosos: { tipo: "baja", estado: "confirmado", poliza_periodos: where } },
        select: { importe: true, inclusion_coberturas: { select: { coberturas: { select: { nombre: true, incluida_en_padre: true } }, inclusiones: { select: { empresa: true, ceco: true, poliza_periodos: { select: { moneda: true } } } } } } },
      }),
    ]);
    const grupos = new Map<string, { empresa: string; ceco: string; cobertura: string; moneda: string; asegurados: Set<string>; prima: Decimal }>();
    const sumar = (empresa: string, c: string | null, cobertura: string, moneda: string, monto: Decimal, inclusion?: bigint) => {
      const k = [empresa, c ?? "", cobertura, moneda].join("|");
      const g = grupos.get(k) ?? { empresa, ceco: c || "Sin CECO", cobertura, moneda, asegurados: new Set<string>(), prima: new Decimal(0) };
      g.prima = g.prima.plus(monto);
      if (inclusion) g.asegurados.add(inclusion.toString());
      grupos.set(k, g);
    };
    for (const l of lineas) sumar(l.inclusiones.empresa, l.inclusiones.ceco, l.coberturas.nombre, l.inclusiones.poliza_periodos.moneda, new Decimal(l.prima_periodo!.toString()), l.id_inclusion);
    for (const d of devoluciones) {
      const ic = d.inclusion_coberturas;
      if (!ic.coberturas.incluida_en_padre) sumar(ic.inclusiones.empresa, ic.inclusiones.ceco, ic.coberturas.nombre, ic.inclusiones.poliza_periodos.moneda, new Decimal(d.importe.toString()));
    }
    const filas = [...grupos.values()]
      .sort((a, b) => a.empresa.localeCompare(b.empresa) || a.ceco.localeCompare(b.ceco) || a.cobertura.localeCompare(b.cobertura))
      .map((g) => [ctx.nombreEmpresa(g.empresa), g.ceco, g.cobertura, g.asegurados.size, g.prima.toFixed(2), g.moneda] as Valor[]);
    return {
      columnas: [{ titulo: "Empresa", tipo: "texto" }, { titulo: "CECO", tipo: "texto" }, { titulo: "Cobertura", tipo: "texto" }, { titulo: "Asegurados", tipo: "entero" }, { titulo: "Prima neta", tipo: "importe" }, { titulo: "Moneda", tipo: "texto" }],
      filas,
      moneda: 5,
    };
  },
};

// ---------------------------------------------------------------- primas por pagar y cuentas por cobrar
const CONCEPTOS: Record<string, string> = { prima: "Prima del período", ajuste_prima: "Prima de endoso", devolucion_prima: "Devolución de prima", reembolso_siniestro: "Reembolso de siniestro", otro: "Otro" };
const obligaciones: Reporte = {
  id: "obligaciones",
  titulo: "Primas por pagar y cuentas por cobrar",
  descripcion: "Saldos con su antigüedad: monto, pagado o cobrado y saldo de cada obligación (desde los movimientos e imputaciones).",
  filtros: async (ctx) => [
    ...filtroEmpresa(ctx),
    { clave: "naturaleza", etiqueta: "Tipo", tipo: "lista", opciones: [{ valor: "por_pagar", etiqueta: "Por pagar" }, { valor: "por_cobrar", etiqueta: "Por cobrar" }], todos: "Ambos" },
    { clave: "estado", etiqueta: "Estado", tipo: "lista", opciones: (["vencida", "por_vencer", "pendiente", "pagada", "anulada"] as const).map((e) => ({ valor: e, etiqueta: ESTADOS_PAGO[e] })), todos: "Todos" },
    { clave: "q", etiqueta: "Contraparte", tipo: "texto", placeholder: "Aseguradora, transportista…" },
    { clave: "vence_hasta", etiqueta: "Vence hasta", tipo: "fecha" },
  ],
  consultar: async (ctx, v) => {
    const dias = await ajuste("primas.dias_por_vencer");
    const filas = await db.obligaciones.findMany({
      where: {
        empresa: { in: empresasDe(ctx, v) },
        ...(v.naturaleza ? { naturaleza: v.naturaleza } : {}),
        ...(v.q ? { partes: { razon_social: { contains: v.q, mode: "insensitive" as const } } } : {}),
        ...(v.vence_hasta ? { fecha_vencimiento: { lte: new Date(`${v.vence_hasta}T00:00:00Z`) } } : {}),
      },
      orderBy: [{ fecha_vencimiento: "asc" }],
      include: { partes: { select: { razon_social: true } }, poliza_periodos: { select: { polizas: { select: { numero: true } } } }, siniestros: { select: { numero_expediente: true } } },
    });
    const saldos = await saldosDe(filas.map((o) => o.id));
    const r: Valor[][] = [];
    const enlaces: string[] = [];
    for (const o of filas) {
      const s = saldos.get(o.id.toString())!;
      const estado = estadoObligacion({ estado: o.estado, saldo: s.saldo, vencimiento: iso(o.fecha_vencimiento) }, ctx.hoy, dias);
      if (v.estado && estado !== v.estado) continue;
      const vencida = Number(s.saldo) > 0 && o.estado === "vigente" ? Math.max(0, diasEntre(iso(o.fecha_vencimiento), ctx.hoy)) : 0;
      r.push([
        ctx.nombreEmpresa(o.empresa), o.naturaleza === "por_pagar" ? "Por pagar" : "Por cobrar", CONCEPTOS[o.concepto] ?? o.concepto, o.partes.razon_social,
        o.siniestros?.numero_expediente ?? o.poliza_periodos?.polizas.numero ?? null, iso(o.fecha_emision), iso(o.fecha_vencimiento), vencida, tramoVencimiento(vencida),
        s.monto, s.imputado, s.saldo, o.moneda, ESTADOS_PAGO[estado],
      ]);
      enlaces.push(`/finanzas/primas/${o.id}`);
    }
    return {
      columnas: [
        { titulo: "Empresa", tipo: "texto" }, { titulo: "Tipo", tipo: "texto" }, { titulo: "Concepto", tipo: "texto" }, { titulo: "Contraparte", tipo: "texto" }, { titulo: "Origen", tipo: "texto" },
        { titulo: "Emisión", tipo: "fecha" }, { titulo: "Vence", tipo: "fecha" }, { titulo: "Días vencida", tipo: "entero" }, { titulo: "Antigüedad", tipo: "texto" },
        { titulo: "Monto", tipo: "importe" }, { titulo: "Pagado / cobrado", tipo: "importe" }, { titulo: "Saldo", tipo: "importe" }, { titulo: "Moneda", tipo: "texto" }, { titulo: "Estado", tipo: "texto" },
      ],
      filas: r,
      enlaces,
      enlaceEn: 3,
      moneda: 12,
    };
  },
};

// ---------------------------------------------------------------- siniestros
const ESTADO_SIN: Record<string, string> = { abierto: "Abierto", cerrado: "Cerrado", anulado: "Anulado" };
const siniestros: Reporte = {
  id: "siniestros",
  titulo: "Siniestros",
  descripcion: "Expedientes con sus importes vigentes, lo cobrado y el saldo por cobrar. Los confidenciales salen sin datos de la persona si no tiene el permiso.",
  filtros: async (ctx) => [
    ...filtroEmpresa(ctx),
    { clave: "tipo", etiqueta: "Tipo", tipo: "lista", opciones: (await db.tipos_siniestro.findMany({ orderBy: { nombre: "asc" } })).map((t) => ({ valor: String(t.id), etiqueta: t.nombre })), todos: "Todos" },
    { clave: "estado", etiqueta: "Estado", tipo: "lista", opciones: Object.entries(ESTADO_SIN).map(([valor, etiqueta]) => ({ valor, etiqueta })), todos: "Todos" },
    { clave: "desde", etiqueta: "Evento desde", tipo: "fecha" },
    { clave: "hasta", etiqueta: "Evento hasta", tipo: "fecha" },
  ],
  consultar: async (ctx, v) => {
    const filas = await db.siniestros.findMany({
      where: {
        empresa: { in: empresasDe(ctx, v) },
        ...(v.tipo ? { id_tipo: Number(v.tipo) } : {}),
        ...(v.estado ? { estado: v.estado } : {}),
        ...(v.desde || v.hasta ? { fecha_evento: { ...(v.desde ? { gte: new Date(`${v.desde}T00:00:00Z`) } : {}), ...(v.hasta ? { lte: new Date(`${v.hasta}T00:00:00Z`) } : {}) } } : {}),
      },
      orderBy: [{ fecha_evento: "desc" }],
      include: {
        tipos_siniestro: { select: { nombre: true, sujeto: true } },
        siniestro_afectados: { select: { vehiculos: { select: { placa: true } }, propiedades: { select: { nombre: true } }, partes: { select: { tipo: true, nombres: true, apellidos: true, razon_social: true } } } },
        siniestro_transporte: { select: { mercancia: true } },
        siniestro_importes: { select: { id: true, tipo: true, monto: true } },
        siniestro_etapas: { where: { fecha_fin: null }, select: { flujo_etapas: { select: { nombre: true } } } },
        poliza_periodos: { select: { polizas: { select: { numero: true } } } },
      },
    });
    const obligs = await db.obligaciones.findMany({ where: { id_siniestro: { in: filas.map((s) => s.id) }, estado: "vigente" }, select: { id: true, id_siniestro: true } });
    const saldos = await saldosDe(obligs.map((o) => o.id));
    const cobro = new Map<string, { cobrado: Decimal; saldo: Decimal }>();
    for (const o of obligs) {
      const s = saldos.get(o.id.toString())!;
      const k = o.id_siniestro!.toString();
      const a = cobro.get(k) ?? { cobrado: new Decimal(0), saldo: new Decimal(0) };
      cobro.set(k, { cobrado: a.cobrado.plus(s.imputado), saldo: a.saldo.plus(s.saldo) });
    }
    return {
      columnas: [
        { titulo: "Empresa", tipo: "texto" }, { titulo: "Expediente", tipo: "texto" }, { titulo: "Evento", tipo: "fecha" }, { titulo: "Tipo", tipo: "texto" }, { titulo: "Clase", tipo: "texto" },
        { titulo: "Afectado", tipo: "texto" }, { titulo: "Póliza", tipo: "texto" }, { titulo: "Etapa", tipo: "texto" }, { titulo: "Presupuestado", tipo: "importe" }, { titulo: "Autorizado", tipo: "importe" },
        { titulo: "Reconocido", tipo: "importe" }, { titulo: "Cobrado", tipo: "importe" }, { titulo: "Por cobrar", tipo: "importe" }, { titulo: "Moneda", tipo: "texto" }, { titulo: "Estado", tipo: "texto" }, { titulo: "Días", tipo: "entero" },
      ],
      filas: filas.map((s) => {
        const reservado = s.confidencial && !ctx.sensibles.includes(s.empresa);
        const imp = importesVigentes(s.siniestro_importes.map((i) => ({ id: Number(i.id), tipo: i.tipo, monto: i.monto.toString() })));
        const c = cobro.get(s.id.toString());
        const afectado = reservado
          ? "Confidencial"
          : s.siniestro_transporte[0]?.mercancia ?? (s.siniestro_afectados.map((a) => a.vehiculos?.placa ?? a.propiedades?.nombre ?? (a.partes ? nombreParte(a.partes) : "")).join(", ") || null);
        return [
          ctx.nombreEmpresa(s.empresa), s.numero_expediente, iso(s.fecha_evento), s.tipos_siniestro.nombre, SUJETOS_SINIESTRO[s.tipos_siniestro.sujeto as keyof typeof SUJETOS_SINIESTRO], afectado,
          s.poliza_periodos?.polizas.numero ?? null, s.siniestro_etapas[0]?.flujo_etapas.nombre ?? null, imp.presupuestado?.toFixed(2) ?? null, imp.autorizado?.toFixed(2) ?? null,
          imp.reconocido?.toFixed(2) ?? null, c?.cobrado.toFixed(2) ?? null, c?.saldo.toFixed(2) ?? null, s.moneda, ESTADO_SIN[s.estado], diasEntre(iso(s.fecha_notificacion), s.cerrado_en ? iso(s.cerrado_en) : ctx.hoy),
        ];
      }),
      enlaces: filas.map((s) => `/siniestros/${s.id}`),
      moneda: 13,
    };
  },
};

export const REPORTES: Reporte[] = [polizas, asegurados, ceco, obligaciones, siniestros];
export const reporte = (id: string) => REPORTES.find((r) => r.id === id) ?? null;
