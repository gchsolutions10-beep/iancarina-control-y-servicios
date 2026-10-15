"use server";

import { revalidatePath } from "next/cache";
import { registrarGestion } from "@/lib/auditoria";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { EstadoAccion } from "@/lib/estado-accion";
import { guardarArchivo } from "@/lib/archivos/almacen";
import { sinPermiso } from "@/lib/fichas/acceso";
import { ENTIDAD_FICHA, type Ficha } from "@/lib/fichas/datos";
import { textoOpcional } from "@/lib/validations/comunes";

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "");
const RUTA: Record<Ficha["tipo"], string> = { parte: "/personas", vehiculo: "/activos/vehiculos", propiedad: "/activos/propiedades" };
const COLUMNA = { parte: "id_parte", vehiculo: "id_vehiculo", propiedad: "id_propiedad" } as const;

async function empresaDeFicha(f: Ficha): Promise<string | null> {
  const where = { where: { id: BigInt(f.id) }, select: { empresa: true } };
  const fila = f.tipo === "parte" ? await db.partes.findUnique(where) : f.tipo === "vehiculo" ? await db.vehiculos.findUnique(where) : await db.propiedades.findUnique(where);
  return fila?.empresa ?? null;
}

function leerFicha(fd: FormData): Ficha | null {
  const tipo = texto(fd, "ficha");
  const id = Number(texto(fd, "id_ficha"));
  if ((tipo === "parte" || tipo === "vehiculo" || tipo === "propiedad") && Number.isInteger(id) && id > 0) return { tipo, id };
  return null;
}

/** Sube un documento o una foto a una ficha. Con `foto=1` además la deja como foto principal. */
export async function subirDocumento(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const ficha = leerFicha(fd);
  if (!ficha) return { error: "Ficha no válida." };
  const empresa = await empresaDeFicha(ficha);
  if (!empresa) return { error: "La ficha ya no existe." };
  const negado = sinPermiso(usuario, empresa, "seguros.registrar");
  if (negado) return { error: negado };

  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elige un archivo.", errores: { archivo: "Elige un archivo" } };
  const esFoto = texto(fd, "foto") === "1";
  const tipoDocumento = esFoto ? "Fotografía" : texto(fd, "tipo_documento").trim();
  if (!tipoDocumento) return { error: "Elige el tipo de documento.", errores: { tipo_documento: "Elige el tipo" } };
  const descripcion = textoOpcional(500).parse(texto(fd, "descripcion"));
  const fechaDoc = texto(fd, "fecha_documento");
  // Solo quien ve datos personales puede marcar o subir documentos confidenciales.
  const confidencial = fd.get("confidencial") === "on" && tienePermiso(usuario, "personas.datos_sensibles", empresa);

  const guardado = await guardarArchivo(archivo, { empresa, usuario: usuario.id, soloImagen: esFoto });
  if (!guardado.ok) return { error: guardado.error, errores: { archivo: "Archivo no válido" } };

  await db.$transaction(async (tx) => {
    const doc = await tx.documentos.create({
      data: {
        empresa,
        id_archivo: guardado.id,
        tipo_documento: tipoDocumento,
        descripcion,
        fecha_documento: /^\d{4}-\d{2}-\d{2}$/.test(fechaDoc) ? new Date(`${fechaDoc}T00:00:00Z`) : null,
        confidencial,
        [COLUMNA[ficha.tipo]]: BigInt(ficha.id),
        creado_por: usuario.id,
      },
    });
    if (esFoto) {
      const data = { id_foto: guardado.id };
      if (ficha.tipo === "parte") await tx.partes.update({ where: { id: BigInt(ficha.id) }, data });
      else if (ficha.tipo === "vehiculo") await tx.vehiculos.update({ where: { id: BigInt(ficha.id) }, data });
      else await tx.propiedades.update({ where: { id: BigInt(ficha.id) }, data });
    }
    await registrarGestion(usuario.id, "DOCUMENTOS", `ID ${ficha.id} | DOCUMENTO ${doc.id}: ${tipoDocumento} «${archivo.name}»${esFoto ? " (foto principal)" : ""}${confidencial ? " [confidencial]" : ""}`, tx, {
      empresa,
      entidad: ENTIDAD_FICHA[ficha.tipo],
      idRegistro: ficha.id,
      operacion: "DOCUMENTO",
    });
  });
  revalidatePath(`${RUTA[ficha.tipo]}/${ficha.id}`);
  return { ok: true, mensaje: esFoto ? "Foto guardada." : "Documento guardado." };
}

/** Retira un documento de la ficha (se oculta; el archivo y su registro se conservan). */
export async function retirarDocumento(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const doc = await db.documentos.findUnique({ where: { id: BigInt(Number(texto(fd, "id_documento"))) } });
  if (!doc || doc.retirado) return { error: "El documento ya no está." };
  const negado = sinPermiso(usuario, doc.empresa, "seguros.registrar");
  if (negado) return { error: negado };
  const ficha: Ficha = doc.id_parte ? { tipo: "parte", id: Number(doc.id_parte) } : doc.id_vehiculo ? { tipo: "vehiculo", id: Number(doc.id_vehiculo) } : { tipo: "propiedad", id: Number(doc.id_propiedad) };
  const motivo = texto(fd, "motivo").trim();
  if (motivo.length < 3) return { error: "Indica el motivo para retirar el documento." };
  await db.$transaction(async (tx) => {
    await tx.documentos.update({ where: { id: doc.id }, data: { retirado: true } });
    await registrarGestion(usuario.id, "DOCUMENTOS", `ID ${ficha.id} | DOCUMENTO ${doc.id} RETIRADO`, tx, {
      empresa: doc.empresa,
      entidad: ENTIDAD_FICHA[ficha.tipo],
      idRegistro: ficha.id,
      operacion: "DOCUMENTO RETIRADO",
      motivo,
    });
  });
  revalidatePath(`${RUTA[ficha.tipo]}/${ficha.id}`);
  return { ok: true, mensaje: "Documento retirado (queda en el historial)." };
}
