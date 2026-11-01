"use server";

import { requerirSesion } from "@/lib/auth/dal";
import { RECORRIDOS } from "@/lib/ayuda/recorridos";
import { db } from "@/lib/db";

/**
 * Recorridos guiados: qué vio cada usuario. Es una preferencia personal (como el tema), por eso no
 * pasa por la bitácora; solo afecta a quien la cambia.
 */
export async function marcarRecorridoVisto(id: string): Promise<void> {
  const u = await requerirSesion();
  if (id !== "primeros-pasos" && !RECORRIDOS.some((r) => r.id === id)) return;
  await db.app_recorridos_vistos.upsert({
    where: { id_usuario_recorrido: { id_usuario: u.id, recorrido: id } },
    create: { id_usuario: u.id, recorrido: id },
    update: { visto_en: new Date() },
  });
}

/** Vuelve a mostrar todos los recorridos (cada uno se abrirá solo al entrar a su pantalla). */
export async function reiniciarRecorridos(): Promise<{ ok: true }> {
  const u = await requerirSesion();
  await db.app_recorridos_vistos.deleteMany({ where: { id_usuario: u.id } });
  return { ok: true };
}
