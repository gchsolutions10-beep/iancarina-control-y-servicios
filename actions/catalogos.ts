"use server";

import { revalidatePath } from "next/cache";
import { registrarGestion } from "@/lib/auditoria";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { esLista } from "@/lib/catalogos";
import { db } from "@/lib/db";
import type { EstadoAccion } from "@/lib/estado-accion";
import { codigoPg } from "@/lib/fichas/acceso";

const RUTA = "/admin/catalogos";
const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();

async function soloAdmin() {
  const u = await requerirSesion();
  return tienePermiso(u, "admin.sistema") ? u : null;
}

/** Agrega un valor a una lista, una marca o un modelo. Nunca se borran: se desactivan. */
export async function agregarCatalogo(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await soloAdmin();
  if (!u) return { error: "Solo el administrador cambia los catálogos." };
  const que = texto(fd, "que");
  const nombre = texto(fd, "nombre").replace(/\s+/g, " ");
  if (nombre.length < 1 || nombre.length > 80) return { errores: { nombre: "Entre 1 y 80 caracteres" } };
  try {
    if (que === "marca") await db.marcas.create({ data: { nombre: nombre.toUpperCase() } });
    else if (que === "modelo") {
      const idMarca = Number(texto(fd, "id_marca"));
      if (!Number.isInteger(idMarca) || idMarca <= 0) return { errores: { id_marca: "Elige la marca" } };
      await db.modelos.create({ data: { id_marca: idMarca, nombre: nombre.toUpperCase() } });
    } else if (esLista(que)) await db.catalogo_valores.create({ data: { lista: que, nombre, orden: 50 } });
    else return { error: "Catálogo no válido." };
  } catch (error) {
    if (codigoPg(error) === "23505") return { errores: { nombre: "Ya existe" } };
    throw error;
  }
  await registrarGestion(u.id, "CATALOGOS", `${que.toUpperCase()}: NUEVO «${nombre}»`);
  revalidatePath(RUTA);
  return { ok: true, mensaje: `«${nombre}» agregado.` };
}

/** Activa o desactiva un valor (los desactivados no aparecen en los formularios). */
export async function alternarCatalogo(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await soloAdmin();
  if (!u) return { error: "Solo el administrador cambia los catálogos." };
  const que = texto(fd, "que");
  const id = Number(texto(fd, "id"));
  const activo = texto(fd, "activo") === "1";
  if (que === "marca") await db.marcas.update({ where: { id }, data: { activo } });
  else if (que === "modelo") await db.modelos.update({ where: { id }, data: { activo } });
  else await db.catalogo_valores.update({ where: { id }, data: { activo } });
  await registrarGestion(u.id, "CATALOGOS", `${que.toUpperCase()} ${id}: ${activo ? "ACTIVADO" : "DESACTIVADO"}`);
  revalidatePath(RUTA);
  return { ok: true };
}
