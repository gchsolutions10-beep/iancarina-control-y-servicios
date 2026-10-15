import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ajuste } from "@/lib/ajustes";
import { estadoObligacion, type EstadoPago } from "@/lib/dominio/saldos";
import { hoyPlanta } from "@/lib/tiempo";

/**
 * Consultas de finanzas. Los saldos salen siempre de la vista cys.vw_saldos_obligaciones (la misma
 * que usarán indicadores y reportes). Importes como texto decimal exacto (::text), nunca float.
 */
type Cliente = typeof db | Prisma.TransactionClient;
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const POR_PAGINA = 25;

const filaSaldo = z.object({ id: z.bigint(), monto: z.string(), imputado: z.string(), saldo: z.string() });

export async function saldosDe(ids: bigint[], cliente: Cliente = db) {
  if (ids.length === 0) return new Map<string, z.infer<typeof filaSaldo>>();
  const filas = await cliente.$queryRaw<unknown[]>`
    SELECT id, monto::text AS monto, imputado::text AS imputado, saldo::text AS saldo
    FROM cys.vw_saldos_obligaciones WHERE id = ANY(${ids}::bigint[])`;
  return new Map(z.array(filaSaldo).parse(filas).map((f) => [f.id.toString(), f]));
}

export const ESTADOS_PAGO: Record<EstadoPago, string> = { vencida: "Vencida", por_vencer: "Por vencer", pendiente: "Pendiente", pagada: "Pagada", anulada: "Anulada" };

export type FiltroObligaciones = { empresas: string[]; q: string; estado: string; naturaleza: "por_pagar" | "por_cobrar"; pagina: number };

/** Obligaciones (primas por pagar o devoluciones por cobrar) con saldo, estado y conteos por estado y moneda. */
export async function listarObligaciones(f: FiltroObligaciones) {
  const q = f.q.trim();
  const dias = await ajuste("primas.dias_por_vencer");
  const hoy = hoyPlanta();
  const obligaciones = await db.obligaciones.findMany({
    where: {
      empresa: { in: f.empresas },
      naturaleza: f.naturaleza,
      concepto: { in: ["prima", "ajuste_prima", "devolucion_prima"] },
      ...(q
        ? { OR: [{ descripcion: { contains: q, mode: "insensitive" } }, { documento: { contains: q, mode: "insensitive" } }, { partes: { razon_social: { contains: q, mode: "insensitive" } } }] }
        : {}),
    },
    orderBy: [{ fecha_vencimiento: "asc" }, { id: "asc" }],
    include: { partes: { select: { razon_social: true } }, poliza_periodos: { select: { id: true, polizas: { select: { numero: true } } } } },
  });
  const saldos = await saldosDe(obligaciones.map((o) => o.id));
  const filas = obligaciones.map((o) => {
    const s = saldos.get(o.id.toString())!;
    return {
      id: Number(o.id),
      empresa: o.empresa,
      concepto: o.concepto,
      aseguradora: o.partes.razon_social ?? "",
      poliza: o.poliza_periodos?.polizas.numero ?? null,
      id_periodo: o.poliza_periodos ? Number(o.poliza_periodos.id) : null,
      descripcion: o.descripcion,
      documento: o.documento,
      moneda: o.moneda,
      vencimiento: iso(o.fecha_vencimiento),
      monto: s.monto,
      imputado: s.imputado,
      saldo: s.saldo,
      estado: estadoObligacion({ estado: o.estado, saldo: s.saldo, vencimiento: iso(o.fecha_vencimiento) }, hoy, dias),
    };
  });
  const conteo = filas.reduce<Record<string, number>>((c, x) => ((c[x.estado] = (c[x.estado] ?? 0) + 1), c), {});
  // Saldo pendiente por moneda (nunca se suman monedas distintas).
  const pendientePorMoneda = new Map<string, number>();
  for (const x of filas) if (x.estado !== "anulada") pendientePorMoneda.set(x.moneda, (pendientePorMoneda.get(x.moneda) ?? 0) + Math.round(Number(x.saldo) * 100));
  const filtradas = f.estado ? filas.filter((x) => x.estado === f.estado) : filas;
  return {
    total: filtradas.length,
    conteo,
    pendiente: [...pendientePorMoneda.entries()].map(([moneda, centimos]) => ({ moneda, saldo: (centimos / 100).toFixed(2) })),
    filas: filtradas.slice((f.pagina - 1) * POR_PAGINA, f.pagina * POR_PAGINA),
  };
}

export async function obtenerObligacion(id: number) {
  const o = await db.obligaciones.findUnique({
    where: { id: BigInt(id) },
    include: {
      partes: { select: { id: true, razon_social: true } },
      poliza_periodos: { select: { id: true, numero_periodo: true, polizas: { select: { id: true, numero: true } } } },
      endosos: { select: { numero: true } },
      obligacion_movimientos: { orderBy: { id: "asc" }, include: { app_usuarios: { select: { nombre_apellido: true } } } },
      imputaciones: {
        orderBy: { id: "asc" },
        include: {
          pagos: { include: { app_usuarios_pagos_creado_porToapp_usuarios: { select: { nombre_apellido: true } }, app_usuarios_pagos_anulado_porToapp_usuarios: { select: { nombre_apellido: true } } } },
        },
      },
    },
  });
  if (!o) return null;
  const s = (await saldosDe([o.id])).get(o.id.toString())!;
  const dias = await ajuste("primas.dias_por_vencer");
  // Un pago por fila (sus reversiones lo marcan anulado).
  const pagos = new Map<string, (typeof o.imputaciones)[number]>();
  for (const i of o.imputaciones) if (!i.revierte_a) pagos.set(i.pagos.id.toString(), i);
  return {
    id: Number(o.id),
    empresa: o.empresa,
    naturaleza: o.naturaleza,
    concepto: o.concepto,
    aseguradora: o.partes.razon_social ?? "",
    id_aseguradora: Number(o.partes.id),
    poliza: o.poliza_periodos ? { id: Number(o.poliza_periodos.polizas.id), numero: o.poliza_periodos.polizas.numero, id_periodo: Number(o.poliza_periodos.id), periodo: o.poliza_periodos.numero_periodo } : null,
    endoso: o.endosos?.numero ?? null,
    descripcion: o.descripcion,
    documento: o.documento,
    moneda: o.moneda,
    emision: iso(o.fecha_emision),
    vencimiento: iso(o.fecha_vencimiento),
    estadoRegistro: o.estado,
    monto: s.monto,
    imputado: s.imputado,
    saldo: s.saldo,
    estado: estadoObligacion({ estado: o.estado, saldo: s.saldo, vencimiento: iso(o.fecha_vencimiento) }, hoyPlanta(), dias),
    movimientos: o.obligacion_movimientos.map((m) => ({ id: Number(m.id), tipo: m.tipo, monto: m.monto.toFixed(2), fecha: iso(m.fecha), motivo: m.motivo, usuario: m.app_usuarios.nombre_apellido })),
    pagos: [...pagos.values()].map((i) => ({
      id: Number(i.pagos.id),
      fecha: iso(i.pagos.fecha),
      monto: i.monto.toFixed(2),
      referencia: i.pagos.referencia,
      observaciones: i.pagos.observaciones,
      estado: i.pagos.estado,
      usuario: i.pagos.app_usuarios_pagos_creado_porToapp_usuarios.nombre_apellido,
      anulado: i.pagos.estado === "anulado" ? { por: i.pagos.app_usuarios_pagos_anulado_porToapp_usuarios?.nombre_apellido ?? "", motivo: i.pagos.motivo_anulacion } : null,
    })),
  };
}

/** Saldo de la prima del período (para la pantalla del período). */
export async function obligacionesPeriodo(idPeriodo: number) {
  const obligaciones = await db.obligaciones.findMany({ where: { id_periodo: BigInt(idPeriodo) }, orderBy: { id: "asc" }, include: { endosos: { select: { numero: true } } } });
  const saldos = await saldosDe(obligaciones.map((o) => o.id));
  return obligaciones.map((o) => {
    const { monto, imputado, saldo } = saldos.get(o.id.toString())!;
    return {
    id: Number(o.id),
    naturaleza: o.naturaleza,
    concepto: o.concepto,
    endoso: o.endosos?.numero ?? null,
    moneda: o.moneda,
    vencimiento: iso(o.fecha_vencimiento),
    estado: o.estado,
    monto,
    imputado,
    saldo,
    };
  });
}
