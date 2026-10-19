"use server";

import { revalidatePath } from "next/cache";
import { registrarGestion } from "@/lib/auditoria";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { EstadoAccion } from "@/lib/estado-accion";
import { codigoPg } from "@/lib/fichas/acceso";

/**
 * Flujos de siniestros, sus etapas con documentos requeridos y los tipos de siniestro (solo el
 * administrador). Nada se borra: las etapas y tipos se desactivan. Un expediente conserva el flujo
 * con que se abrió; los cambios de etapas valen para lo que falta recorrer.
 */
const RUTA = "/admin/flujos";
const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();

async function soloAdmin() {
  const u = await requerirSesion();
  return tienePermiso(u, "admin.sistema") ? u : null;
}
const NO = { error: "Solo el administrador configura los flujos de siniestros." };

export async function agregarFlujo(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await soloAdmin();
  if (!u) return NO;
  const nombre = texto(fd, "nombre").replace(/\s+/g, " ");
  if (nombre.length < 3 || nombre.length > 120) return { errores: { nombre: "Entre 3 y 120 caracteres" } };
  try {
    await db.flujos.create({ data: { nombre, descripcion: texto(fd, "descripcion") || null } });
  } catch (error) {
    if (codigoPg(error) === "23505") return { errores: { nombre: "Ya existe" } };
    throw error;
  }
  await registrarGestion(u.id, "FLUJOS", `FLUJO NUEVO «${nombre}»`);
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Flujo creado. Agrégale sus etapas." };
}

/** Agrega o modifica una etapa (nombre, orden, documentos requeridos, activa). */
export async function guardarEtapa(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await soloAdmin();
  if (!u) return NO;
  const id = Number(texto(fd, "id")) || null;
  const idFlujo = Number(texto(fd, "id_flujo"));
  const nombre = texto(fd, "nombre").replace(/\s+/g, " ");
  const orden = Number(texto(fd, "orden"));
  const documentos = fd.getAll("documentos").map(String).filter(Boolean);
  const activo = id ? fd.get("activo") === "on" : true;
  if (nombre.length < 2 || nombre.length > 120) return { errores: { nombre: "Entre 2 y 120 caracteres" } };
  if (!Number.isInteger(orden) || orden < 1 || orden > 99) return { errores: { orden: "Entre 1 y 99" } };
  try {
    if (id) await db.flujo_etapas.update({ where: { id }, data: { nombre, orden, documentos_requeridos: documentos, activo } });
    else await db.flujo_etapas.create({ data: { id_flujo: idFlujo, nombre, orden, documentos_requeridos: documentos } });
  } catch (error) {
    if (codigoPg(error) === "23505") return { errores: { orden: "Ya hay una etapa activa con ese orden o ese nombre" } };
    throw error;
  }
  await registrarGestion(u.id, "FLUJOS", `ETAPA ${id ? `${id} MODIFICADA` : "NUEVA"} «${nombre}» orden ${orden}${activo ? "" : " (inactiva)"} · documentos: ${documentos.join(", ") || "ninguno"}`);
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Etapa guardada." };
}

export async function guardarTipoSiniestro(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await soloAdmin();
  if (!u) return NO;
  const id = Number(texto(fd, "id")) || null;
  const idFlujo = Number(texto(fd, "id_flujo"));
  if (!(await db.flujos.findUnique({ where: { id: idFlujo || 0 } }))) return { errores: { id_flujo: "Elige el flujo" } };
  if (id) {
    const activo = fd.get("activo") === "on";
    await db.tipos_siniestro.update({ where: { id }, data: { id_flujo: idFlujo, activo } });
    await registrarGestion(u.id, "FLUJOS", `TIPO DE SINIESTRO ${id}: flujo ${idFlujo}${activo ? "" : " (inactivo)"}`);
  } else {
    const nombre = texto(fd, "nombre").replace(/\s+/g, " ");
    const sujeto = texto(fd, "sujeto");
    if (nombre.length < 3 || nombre.length > 120) return { errores: { nombre: "Entre 3 y 120 caracteres" } };
    if (!["vehiculo", "persona", "propiedad", "transporte"].includes(sujeto)) return { errores: { sujeto: "Elige qué se afecta" } };
    try {
      await db.tipos_siniestro.create({ data: { nombre, sujeto, id_flujo: idFlujo } });
    } catch (error) {
      if (codigoPg(error) === "23505") return { errores: { nombre: "Ya existe" } };
      throw error;
    }
    await registrarGestion(u.id, "FLUJOS", `TIPO DE SINIESTRO NUEVO «${nombre}» (${sujeto})`);
  }
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Tipo guardado." };
}
