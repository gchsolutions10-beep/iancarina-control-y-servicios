"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { registrarGestion } from "@/lib/auditoria";
import { requerirSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { mensajeErrorFusion, ordenarPar } from "@/lib/dominio/fusion";
import type { EstadoAccion } from "@/lib/estado-accion";
import { codigoPg, sinPermiso } from "@/lib/fichas/acceso";
import { compararFichas } from "@/lib/personas/fusion";
import { erroresDeZod } from "@/lib/validations/comunes";
import { nombreParte } from "@/lib/validations/fichas";

/**
 * Consolidar personas duplicadas: fusionar, revertir y marcar «no son la misma persona».
 * Permiso «Anular y ajustar» en la empresa (el administrador lo tiene siempre).
 */
const MODULO = "PERSONAS";
const PERMISO = "movimientos.anular" as const;
const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "");
const motivo = z.string().trim().min(5, "Explique en una frase por qué (mínimo 5 caracteres)").max(500);

export async function fusionarPersonas(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await requerirSesion();
  const entrada = z.object({ origen: z.coerce.number().int().positive(), destino: z.coerce.number().int().positive(), motivo, confirmo: z.literal("on", { error: "Marque la confirmación" }) })
    .safeParse({ origen: texto(fd, "origen"), destino: texto(fd, "destino"), motivo: texto(fd, "motivo"), confirmo: texto(fd, "confirmo") });
  if (!entrada.success) {
    const errores = erroresDeZod(entrada.error);
    return { error: errores.confirmo && !errores.motivo ? "Marque la casilla de confirmación para fusionar." : "Revisa los campos marcados.", errores };
  }
  const { origen, destino } = entrada.data;
  const c = await compararFichas(origen, destino);
  if (!c) return { error: "Una de las fichas ya no existe." };
  const negado = sinPermiso(u, c.origen.empresa, PERMISO) ?? sinPermiso(u, c.destino.empresa, PERMISO);
  if (negado) return { error: "Fusionar fichas requiere el permiso «Anular y ajustar» en la empresa." };
  if (c.bloqueos.length) return { error: c.bloqueos.join(" ") };

  try {
    await db.$transaction(async (tx) => {
      const [{ id }] = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT cys.fusionar_partes(${c.origen.empresa}, ${BigInt(origen)}, ${BigInt(destino)}, ${entrada.data.motivo}, ${u.id}) AS id`;
      const resumen = `FUSIÓN ${id}: «${c.origen.nombre}» (${c.origen.tipo_identificacion}-${c.origen.numero_identificacion}, N° ${origen}) -> «${c.destino.nombre}» (${c.destino.tipo_identificacion}-${c.destino.numero_identificacion}, N° ${destino})`;
      const detalle = { empresa: c.origen.empresa, entidad: "partes", operacion: "FUSION", motivo: entrada.data.motivo };
      await registrarGestion(u.id, MODULO, resumen, tx, { ...detalle, idRegistro: origen });
      await registrarGestion(u.id, MODULO, resumen, tx, { ...detalle, idRegistro: destino });
    });
  } catch (error) {
    console.error("[fusionarPersonas]", error);
    return { error: mensajeErrorFusion(codigoPg(error)) };
  }
  revalidatePath("/personas/duplicados");
  redirect(`/personas/${destino}?hecho=fusion`);
}

export async function revertirFusion(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await requerirSesion();
  const entrada = z.object({ id: z.coerce.number().int().positive(), motivo }).safeParse({ id: texto(fd, "id"), motivo: texto(fd, "motivo") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const f = await db.fusiones_personas.findUnique({ where: { id: BigInt(entrada.data.id) } });
  if (!f) return { error: "La fusión ya no existe." };
  const negado = sinPermiso(u, f.empresa, PERMISO);
  if (negado) return { error: "Revertir una fusión requiere el permiso «Anular y ajustar» en la empresa." };
  if (f.revertida_en) return { error: "Esta fusión ya se revirtió." };
  const [o, d] = await Promise.all([db.partes.findUnique({ where: { id: f.id_origen } }), db.partes.findUnique({ where: { id: f.id_destino } })]);
  if (!o || o.estado !== "fusionada" || o.fusionada_en !== f.id_destino) return { error: "La ficha original ya no está fusionada en esta: no se puede revertir." };
  if (!d || d.estado === "fusionada") return { error: "La ficha que quedó se fusionó después en otra: revierta primero esa fusión." };

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT cys.revertir_fusion(${f.empresa}, ${f.id}, ${entrada.data.motivo}, ${u.id})`;
      const resumen = `FUSIÓN ${f.id} REVERTIDA: «${nombreParte(o)}» (N° ${o.id}) vuelve a ser una ficha aparte de «${nombreParte(d)}» (N° ${d.id})`;
      const detalle = { empresa: f.empresa, entidad: "partes", operacion: "REVERTIR_FUSION", motivo: entrada.data.motivo };
      await registrarGestion(u.id, MODULO, resumen, tx, { ...detalle, idRegistro: o.id });
      await registrarGestion(u.id, MODULO, resumen, tx, { ...detalle, idRegistro: d.id });
    });
  } catch (error) {
    console.error("[revertirFusion]", error);
    return { error: mensajeErrorFusion(codigoPg(error)) };
  }
  revalidatePath("/personas/duplicados");
  redirect(`/personas/${Number(f.id_origen)}?hecho=revertida`);
}

/** El par revisado no es la misma persona: deja de proponerse como duplicado. */
export async function marcarDistintas(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await requerirSesion();
  const [a, b] = ordenarPar(Number(texto(fd, "a")) || 0, Number(texto(fd, "b")) || 0);
  const fichas = await db.partes.findMany({ where: { id: { in: [BigInt(a), BigInt(b)] } }, select: { id: true, empresa: true, tipo: true, nombres: true, apellidos: true, razon_social: true } });
  if (fichas.length !== 2 || fichas[0].empresa !== fichas[1].empresa) return { error: "Las fichas ya no existen." };
  const empresa = fichas[0].empresa;
  const negado = sinPermiso(u, empresa, PERMISO);
  if (negado) return { error: "Requiere el permiso «Anular y ajustar» en la empresa." };
  await db.$transaction(async (tx) => {
    await tx.personas_distintas.upsert({
      where: { empresa_id_a_id_b: { empresa, id_a: BigInt(a), id_b: BigInt(b) } },
      create: { empresa, id_a: BigInt(a), id_b: BigInt(b), creado_por: u.id },
      update: {},
    });
    await registrarGestion(u.id, MODULO, `NO DUPLICADOS: N° ${a} y N° ${b} (${fichas.map(nombreParte).join(" / ")}) son personas distintas`, tx, { empresa, entidad: "partes", idRegistro: a, operacion: "NO_DUPLICADO" });
  });
  revalidatePath("/personas/duplicados");
  return { ok: true, mensaje: "Listo: no volverán a proponerse como duplicadas." };
}
