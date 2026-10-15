"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describirCambios, registrarGestion } from "@/lib/auditoria";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { EstadoAccion } from "@/lib/estado-accion";
import { codigoPg, sinPermiso } from "@/lib/fichas/acceso";
import { partesParecidas } from "@/lib/fichas/datos";
import { erroresDeZod } from "@/lib/validations/comunes";
import { CAMPOS_SENSIBLES, nombreParte, normalizarCodigo, parteSchema, relacionSchema } from "@/lib/validations/fichas";

const MODULO = "PERSONAS";
const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "");

/** Crea o modifica una persona natural o jurídica. */
export async function guardarParte(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const id = Number(texto(fd, "id")) || null;
  const anterior = id ? await db.partes.findUnique({ where: { id: BigInt(id) } }) : null;
  if (id && !anterior) return { error: "La ficha ya no existe." };
  const empresa = anterior?.empresa ?? texto(fd, "empresa");
  const negado = sinPermiso(usuario, empresa, "seguros.registrar");
  if (negado) return { error: negado };
  const verSensibles = tienePermiso(usuario, "personas.datos_sensibles", empresa);

  const entrada = parteSchema.safeParse({
    tipo: anterior?.tipo ?? texto(fd, "tipo"),
    tipo_identificacion: texto(fd, "tipo_identificacion"),
    numero_identificacion: texto(fd, "numero_identificacion"),
    nombres: texto(fd, "nombres").toUpperCase(),
    apellidos: texto(fd, "apellidos").toUpperCase(),
    razon_social: texto(fd, "razon_social").toUpperCase(),
    funciones: fd.getAll("funciones").map(String),
    fecha_nacimiento: texto(fd, "fecha_nacimiento"),
    telefono: texto(fd, "telefono"),
    correo: texto(fd, "correo"),
    direccion: texto(fd, "direccion"),
    observaciones: texto(fd, "observaciones"),
  });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const datos = { ...entrada.data };
  // Sin permiso de datos personales, al modificar se conservan los que ya había (no los ve).
  if (anterior && !verSensibles) {
    for (const c of CAMPOS_SENSIBLES) (datos as Record<string, unknown>)[c] = anterior[c];
  }

  // Duplicados: la identificación exacta bloquea; un nombre parecido pide confirmación.
  const ident = normalizarCodigo(datos.tipo_identificacion + datos.numero_identificacion);
  const mismo = await db.partes.findFirst({
    where: { empresa, identificacion_normalizada: ident, estado: { not: "fusionada" }, ...(id ? { id: { not: BigInt(id) } } : {}) },
    select: { id: true, tipo: true, nombres: true, apellidos: true, razon_social: true },
  });
  if (mismo) return { error: `Ya existe una ficha con esa identificación: ${nombreParte(mismo)} (N° ${mismo.id}).`, errores: { numero_identificacion: "Identificación ya registrada" } };
  if (!id && fd.get("es_distinta") !== "on") {
    const parecidas = await partesParecidas(empresa, nombreParte(datos));
    if (parecidas.length) {
      return {
        error: `Hay fichas con nombre parecido: ${parecidas.map((p) => `${p.nombre} (${p.identificacion})`).join("; ")}. Si es otra persona, marca «Es una persona distinta» y guarda de nuevo.`,
      };
    }
  }

  const valores = { ...datos, actualizado_por: usuario.id, actualizado_en: new Date() };
  const fecha = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);
  let idGuardado: number;
  try {
    idGuardado = await db.$transaction(async (tx) => {
      const guardado = anterior
        ? await tx.partes.update({ where: { id: anterior.id }, data: { ...valores, fecha_nacimiento: fecha(datos.fecha_nacimiento) } })
        : await tx.partes.create({ data: { ...valores, fecha_nacimiento: fecha(datos.fecha_nacimiento), empresa, creado_por: usuario.id } });
      const comparable = (p: typeof guardado) => ({
        tipo: p.tipo,
        identificacion: `${p.tipo_identificacion}-${p.numero_identificacion}`,
        nombre: nombreParte(p),
        funciones: p.funciones.join(", "),
        fecha_nacimiento: p.fecha_nacimiento,
        telefono: p.telefono,
        correo: p.correo,
        direccion: p.direccion,
        observaciones: p.observaciones,
      });
      const cambios = describirCambios(Number(guardado.id), anterior ? comparable(anterior) : null, comparable(guardado));
      if (cambios) {
        await registrarGestion(usuario.id, MODULO, cambios, tx, { empresa, entidad: "partes", idRegistro: guardado.id, operacion: anterior ? "MODIFICAR" : "CREAR" });
      }
      return Number(guardado.id);
    });
  } catch (error) {
    if (codigoPg(error) === "23505") return { error: "Ya existe una ficha con esa identificación.", errores: { numero_identificacion: "Identificación ya registrada" } };
    console.error("[guardarParte]", error);
    return { error: "No se pudo guardar. Intenta de nuevo." };
  }
  revalidatePath("/personas");
  if (!id) redirect(`/personas/${idGuardado}?creada=1`);
  revalidatePath(`/personas/${idGuardado}`);
  return { ok: true, mensaje: "Cambios guardados." };
}

/** Agrega una relación con la empresa (socio, accionista…). Nunca solapa la misma relación en el tiempo. */
export async function agregarRelacion(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const idParte = Number(texto(fd, "id_parte"));
  const parte = await db.partes.findUnique({ where: { id: BigInt(idParte) }, select: { empresa: true, estado: true } });
  if (!parte) return { error: "La ficha ya no existe." };
  const negado = sinPermiso(usuario, parte.empresa, "seguros.registrar");
  if (negado) return { error: negado };
  const entrada = relacionSchema.safeParse({
    tipo_relacion: texto(fd, "tipo_relacion"),
    porcentaje: texto(fd, "porcentaje"),
    desde: texto(fd, "desde"),
    hasta: texto(fd, "hasta"),
    observaciones: texto(fd, "observaciones"),
  });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  try {
    await db.$transaction(async (tx) => {
      const r = await tx.relaciones_empresa.create({
        data: {
          empresa: parte.empresa,
          id_parte: BigInt(idParte),
          tipo_relacion: d.tipo_relacion,
          porcentaje: d.porcentaje,
          desde: new Date(`${d.desde}T00:00:00Z`),
          hasta: d.hasta ? new Date(`${d.hasta}T00:00:00Z`) : null,
          observaciones: d.observaciones,
          creado_por: usuario.id,
        },
      });
      await registrarGestion(
        usuario.id,
        MODULO,
        `ID ${idParte} | RELACIÓN ${r.id}: ${d.tipo_relacion}${d.porcentaje ? ` ${d.porcentaje} %` : ""} desde ${d.desde}${d.hasta ? ` hasta ${d.hasta}` : ""}`,
        tx,
        { empresa: parte.empresa, entidad: "partes", idRegistro: idParte, operacion: "RELACION" },
      );
    });
  } catch (error) {
    if (codigoPg(error) === "23P01") return { error: "Ya tiene esa relación en un período que se cruza con estas fechas." };
    console.error("[agregarRelacion]", error);
    return { error: "No se pudo guardar. Intenta de nuevo." };
  }
  revalidatePath(`/personas/${idParte}`);
  return { ok: true, mensaje: "Relación registrada." };
}

/** Termina una relación vigente con fecha (no se borra: queda en el historial). */
export async function cerrarRelacion(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const rel = await db.relaciones_empresa.findUnique({ where: { id: BigInt(Number(texto(fd, "id_relacion"))) } });
  if (!rel) return { error: "La relación ya no existe." };
  const negado = sinPermiso(usuario, rel.empresa, "seguros.registrar");
  if (negado) return { error: negado };
  const hasta = texto(fd, "hasta");
  const desde = rel.desde.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta < desde) return { error: `Indica una fecha de fin igual o posterior al ${desde}.`, errores: { hasta: "Fecha no válida" } };
  if (rel.hasta) return { error: "La relación ya estaba terminada." };
  await db.$transaction(async (tx) => {
    await tx.relaciones_empresa.update({ where: { id: rel.id }, data: { hasta: new Date(`${hasta}T00:00:00Z`) } });
    await registrarGestion(usuario.id, MODULO, `ID ${rel.id_parte} | RELACIÓN ${rel.id} (${rel.tipo_relacion}) TERMINADA el ${hasta}`, tx, {
      empresa: rel.empresa,
      entidad: "partes",
      idRegistro: rel.id_parte,
      operacion: "RELACION",
    });
  });
  revalidatePath(`/personas/${rel.id_parte}`);
  return { ok: true, mensaje: "Relación terminada." };
}
