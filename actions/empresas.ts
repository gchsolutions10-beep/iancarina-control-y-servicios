"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { describirCambios, registrarGestion } from "@/lib/auditoria";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { erroresDeZod } from "@/lib/validations/comunes";

export type EstadoEmpresa = { ok?: boolean; mensaje?: string; error?: string; errores?: Record<string, string | undefined> } | null;

const esquema = z.object({
  codigo: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Mínimo 2 caracteres")
    .max(30, "Máximo 30 caracteres")
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guion (ej.: mary-iancarina)"),
  nombre: z.string().trim().min(3, "Escribe el nombre").max(150, "Máximo 150 caracteres"),
  rif: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^[JGVEP]-?\d{8}-?\d$/.test(v), "RIF no válido (ej.: J-12345678-9)"),
  orden: z.coerce.number().int().min(0).max(999),
  activa: z.boolean(),
});

/** Crea o modifica una empresa. Solo el administrador. Las empresas no se borran: se desactivan. */
export async function guardarEmpresa(_previo: EstadoEmpresa, formData: FormData): Promise<EstadoEmpresa> {
  const usuario = await requerirSesion();
  if (!tienePermiso(usuario, "admin.sistema")) return { error: "Solo el administrador gestiona las empresas." };

  const existente = String(formData.get("existente") ?? "");
  const entrada = esquema.safeParse({
    codigo: existente || String(formData.get("codigo") ?? ""),
    nombre: String(formData.get("nombre") ?? ""),
    rif: String(formData.get("rif") ?? ""),
    orden: String(formData.get("orden") ?? "0"),
    activa: existente ? formData.get("activa") === "on" : true,
  });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const datos = entrada.data;

  const anterior = existente ? await db.app_empresas.findUnique({ where: { codigo: existente } }) : null;
  if (existente && !anterior) return { error: "La empresa ya no existe." };
  if (!existente && (await db.app_empresas.findUnique({ where: { codigo: datos.codigo } }))) {
    return { error: "Revisa los campos marcados.", errores: { codigo: "Ya existe una empresa con ese código" } };
  }
  if (datos.rif) {
    const mismoRif = await db.app_empresas.findFirst({ where: { rif: { equals: datos.rif, mode: "insensitive" }, codigo: { not: datos.codigo } } });
    if (mismoRif) return { error: "Revisa los campos marcados.", errores: { rif: `Ese RIF ya es de ${mismoRif.nombre}` } };
  }

  const valores = { nombre: datos.nombre, rif: datos.rif, orden: datos.orden, activa: datos.activa };
  await db.$transaction(async (tx) => {
    if (anterior) await tx.app_empresas.update({ where: { codigo: datos.codigo }, data: valores });
    else await tx.app_empresas.create({ data: { codigo: datos.codigo, ...valores } });
    const cambios = describirCambios(0, anterior ? { nombre: anterior.nombre, rif: anterior.rif, orden: anterior.orden, activa: anterior.activa } : null, valores);
    if (cambios) await registrarGestion(usuario.id, "EMPRESAS", cambios.replace(/^ID 0/, `EMPRESA ${datos.codigo}`), tx);
  });

  revalidatePath("/admin/empresas");
  return { ok: true, mensaje: anterior ? "Empresa actualizada." : "Empresa creada. Ya puedes asignarle usuarios." };
}
