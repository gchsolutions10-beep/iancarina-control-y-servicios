"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registrarGestion } from "@/lib/auditoria";
import { requerirSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { validarImputacion } from "@/lib/dominio/saldos";
import type { EstadoAccion } from "@/lib/estado-accion";
import { sinPermiso } from "@/lib/fichas/acceso";
import { saldosDe } from "@/lib/finanzas/datos";
import { erroresDeZod } from "@/lib/validations/comunes";
import { pagoSchema } from "@/lib/validations/polizas";

/**
 * Pagos de primas (y cobros de devoluciones). Un pago se imputa a una obligación; nada se borra:
 * anular un pago revierte sus imputaciones con registros inversos y deja el pago «anulado».
 * La base valida además moneda, saldo y sentido (disparador imputaciones_validar).
 */

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "");
const fecha = (v: string) => new Date(`${v}T00:00:00Z`);
const MODULO = "FINANZAS";

export async function registrarPago(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const id = Number(texto(fd, "id_obligacion"));
  const o = Number.isInteger(id) && id > 0 ? await db.obligaciones.findUnique({ where: { id: BigInt(id) } }) : null;
  if (!o) return { error: "La obligación ya no existe." };
  const negado = sinPermiso(usuario, o.empresa, "seguros.registrar");
  if (negado) return { error: negado };
  if (o.estado !== "vigente") return { error: "La obligación está anulada." };
  const entrada = pagoSchema.safeParse({ fecha: texto(fd, "fecha"), monto: texto(fd, "monto"), referencia: texto(fd, "referencia"), observaciones: texto(fd, "observaciones") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  const saldo = (await saldosDe([o.id])).get(o.id.toString());
  const problema = validarImputacion({ monto: d.monto, moneda: o.moneda }, { saldo: saldo?.saldo ?? "0", moneda: o.moneda });
  if (problema) return { errores: { monto: problema } };
  const egreso = o.naturaleza === "por_pagar";

  try {
    await db.$transaction(async (tx) => {
      const p = await tx.pagos.create({
        data: { empresa: o.empresa, sentido: egreso ? "egreso" : "ingreso", fecha: fecha(d.fecha), monto: d.monto, moneda: o.moneda, referencia: d.referencia, id_contraparte: o.id_contraparte, observaciones: d.observaciones, creado_por: usuario.id },
      });
      await tx.imputaciones.create({ data: { empresa: o.empresa, id_pago: p.id, id_obligacion: o.id, monto: d.monto, fecha: fecha(d.fecha), creado_por: usuario.id } });
      await registrarGestion(usuario.id, MODULO, `OBLIGACIÓN ${o.id} | ${egreso ? "PAGO" : "COBRO"} ${d.monto} ${o.moneda} el ${d.fecha}${d.referencia ? ` ref. ${d.referencia}` : ""} [pago ${p.id}]`, tx, {
        empresa: o.empresa, entidad: "obligaciones", idRegistro: o.id, operacion: egreso ? "PAGO" : "COBRO",
      });
    });
  } catch (error) {
    const m = error instanceof Error ? error.message : "";
    if (/supera|moneda|vigentes/.test(m)) return { error: m.match(/(La imputación[^"\n]*|El pago[^"\n]*)/)?.[1] ?? "El pago no es válido para esta obligación." };
    console.error("[registrarPago]", error);
    return { error: "No se pudo registrar el pago. Intenta de nuevo." };
  }
  revalidatePath(`/finanzas/primas/${o.id}`);
  revalidatePath("/finanzas/primas");
  return { ok: true, mensaje: egreso ? "Pago registrado." : "Cobro registrado." };
}

/** Anula un pago: revierte sus imputaciones (registros inversos) y lo marca anulado con su motivo. */
export async function anularPago(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const id = Number(texto(fd, "id"));
  const p = Number.isInteger(id) && id > 0 ? await db.pagos.findUnique({ where: { id: BigInt(id) }, include: { imputaciones: true } }) : null;
  if (!p) return { error: "El pago ya no existe." };
  const negado = sinPermiso(usuario, p.empresa, "movimientos.anular");
  if (negado) return { error: "Anular pagos requiere el permiso «Anular y ajustar» en esta empresa." };
  if (p.estado === "anulado") return { error: "El pago ya estaba anulado." };
  const motivo = texto(fd, "motivo").trim();
  if (motivo.length < 3) return { errores: { motivo: "Indica el motivo" } };
  const revertidas = new Set(p.imputaciones.filter((i) => i.revierte_a).map((i) => i.revierte_a!.toString()));
  const vigentes = p.imputaciones.filter((i) => !i.revierte_a && !revertidas.has(i.id.toString()));
  const hoy = new Date().toISOString().slice(0, 10);

  await db.$transaction(async (tx) => {
    for (const i of vigentes) {
      await tx.imputaciones.create({ data: { empresa: p.empresa, id_pago: p.id, id_obligacion: i.id_obligacion, monto: i.monto, fecha: fecha(hoy), revierte_a: i.id, creado_por: usuario.id } });
    }
    await tx.pagos.update({ where: { id: p.id }, data: { estado: "anulado", anulado_por: usuario.id, anulado_en: new Date(), motivo_anulacion: motivo } });
    for (const idObligacion of new Set(vigentes.map((i) => i.id_obligacion))) {
      await registrarGestion(usuario.id, MODULO, `OBLIGACIÓN ${idObligacion} | PAGO ${p.id} ANULADO (${p.monto.toFixed(2)} ${p.moneda}); se revirtió su imputación`, tx, {
        empresa: p.empresa, entidad: "obligaciones", idRegistro: idObligacion, operacion: "ANULAR", motivo,
      });
    }
  });
  for (const i of vigentes) revalidatePath(`/finanzas/primas/${i.id_obligacion}`);
  revalidatePath("/finanzas/primas");
  // El formulario de anulación desaparece con el pago anulado: el aviso va arriba.
  const destino = vigentes[0]?.id_obligacion ?? texto(fd, "id_obligacion");
  if (destino) redirect(`/finanzas/primas/${destino}?hecho=${encodeURIComponent("Pago anulado. El saldo volvió a quedar pendiente.")}`);
  return { ok: true, mensaje: "Pago anulado. El saldo volvió a quedar pendiente." };
}
