"use server";

import { revalidatePath } from "next/cache";
import { AJUSTES, esClaveAjuste } from "@/lib/ajustes";
import { registrarGestion } from "@/lib/auditoria";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export type EstadoAjuste = { ok?: boolean; mensaje?: string; error?: string } | null;

/** Cambia un parámetro del sistema (según su editor: administrador o desarrollador). Queda en la bitácora. */
export async function guardarAjuste(_previo: EstadoAjuste, formData: FormData): Promise<EstadoAjuste> {
  const usuario = await requerirSesion();
  const clave = String(formData.get("clave") ?? "");
  if (!esClaveAjuste(clave)) return { error: "Ajuste desconocido." };
  const definicion = AJUSTES[clave];
  if (!tienePermiso(usuario, definicion.editor)) return { error: "No tienes permiso para cambiar este ajuste." };
  const valor = definicion.esquema.safeParse(formData.get("valor") ?? "");
  if (!valor.success) return { error: valor.error.issues[0]?.message ?? "Valor no válido." };

  const anterior = await db.app_ajustes.findUnique({ where: { clave } });
  await db.$transaction(async (tx) => {
    await tx.app_ajustes.upsert({
      where: { clave },
      update: { valor: valor.data, actualizado_en: new Date(), actualizado_por: usuario.id },
      create: { clave, valor: valor.data, descripcion: definicion.detalle, actualizado_por: usuario.id },
    });
    await registrarGestion(usuario.id, "AJUSTES", `[${clave}]: '${JSON.stringify(anterior?.valor ?? null)}' -> '${JSON.stringify(valor.data)}'`, tx);
  });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Ajuste guardado. Aplica de inmediato." };
}
