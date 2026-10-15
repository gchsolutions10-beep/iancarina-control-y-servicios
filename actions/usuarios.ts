"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { comoGestor, requerirSesion, requerirSesionPendiente } from "@/lib/auth/dal";
import { esPermisoEmpresa } from "@/lib/auth/permisos";
import { listarEmpresas } from "@/lib/empresas";
import { describirCambios, registrarGestion } from "@/lib/auditoria";
import { db } from "@/lib/db";
import { aplicarCambios, esRolEmpresa, esRolGlobal, puedeGestionar, puedeGestionarUsuarios, type Asignaciones } from "@/lib/usuarios/alcance";
import { administradoresActivos, leerAsignaciones } from "@/lib/usuarios/datos";
import { erroresDeZod } from "@/lib/validations/comunes";
import { cambioClaveSchema, claveNueva, usuarioSchema } from "@/lib/validations/usuarios";

const MODULO_LOG = "USUARIOS";
const RUTA = "/admin/usuarios";
const COSTO_BCRYPT = 12;

export type EstadoUsuario = { ok?: boolean; mensaje?: string; error?: string; errores?: Record<string, string | undefined> } | null;

/** Campos del formulario: rol_<dpto>, hasta_<dpto>, exc_<dpto> (varios) y exc_hasta_<dpto>. */
function leerUsuario(formData: FormData, EMPRESAS: string[]) {
  const texto = (campo: string) => String(formData.get(campo) ?? "");
  return usuarioSchema.safeParse({
    nombre_usuario: texto("nombre_usuario"),
    nombre_apellido: texto("nombre_apellido"),
    cedula: texto("cedula"),
    cargo: texto("cargo"),
    bloqueado: formData.get("bloqueado") === "on",
    recibe_alertas: formData.get("recibe_alertas") === "on",
    recibe_aprobaciones: formData.get("recibe_aprobaciones") === "on",
    globales: formData.getAll("globales").map(String),
    empresas: EMPRESAS.filter((d) => texto(`rol_${d}`)).map((d) => ({ empresa: d, rol: texto(`rol_${d}`), vigenteHasta: texto(`hasta_${d}`) })),
    excepciones: EMPRESAS.flatMap((d) =>
      formData.getAll(`exc_${d}`).map((p) => ({ empresa: d, permiso: String(p), vigenteHasta: texto(`exc_hasta_${d}`) })),
    ),
  });
}

/** Texto comparable de las asignaciones, para la bitácora. */
function resumen(a: Asignaciones | null) {
  if (!a) return null;
  const hasta = (h: string | null) => (h ? ` hasta ${h}` : "");
  return {
    roles_globales: a.globales.join(", ") || null,
    empresas: a.empresas.map((x) => `${x.empresa}:${x.rol}${hasta(x.vigenteHasta)}`).sort().join(", ") || null,
    excepciones: a.excepciones.map((x) => `${x.empresa}:${x.permiso}${hasta(x.vigenteHasta)}`).sort().join(", ") || null,
    bloqueado: a.bloqueado,
  };
}

/** Crea o modifica un usuario dentro del alcance de quien lo gestiona (ver lib/usuarios/alcance.ts). */
export async function guardarUsuario(_previo: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  const actor = await requerirSesion();
  const gestor = comoGestor(actor);
  if (!puedeGestionarUsuarios(gestor)) return { error: "No tienes permiso para gestionar usuarios." };

  const idTexto = String(formData.get("id") ?? "");
  const id = idTexto ? Number(idTexto) : null;
  const codigos = (await listarEmpresas()).map((e) => e.codigo);
  const entrada = leerUsuario(formData, codigos);
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const datos = entrada.data;

  const propuesta: Asignaciones = {
    globales: datos.globales.filter(esRolGlobal),
    empresas: datos.empresas.flatMap((a) =>
      codigos.includes(a.empresa) && esRolEmpresa(a.rol) ? [{ empresa: a.empresa, rol: a.rol, vigenteHasta: a.vigenteHasta }] : [],
    ),
    excepciones: datos.excepciones.flatMap((e) =>
      codigos.includes(e.empresa) && esPermisoEmpresa(e.permiso) ? [{ empresa: e.empresa, permiso: e.permiso, vigenteHasta: e.vigenteHasta }] : [],
    ),
    bloqueado: datos.bloqueado,
  };

  const anterior = id ? await db.app_usuarios.findUnique({ where: { id_usuario: id } }) : null;
  if (id && !anterior) return { error: "El usuario ya no existe." };
  const asignacionesAntes = id ? await leerAsignaciones(id) : null;

  const resultado = aplicarCambios(gestor, id, asignacionesAntes, propuesta);
  if (!resultado.ok) return { error: resultado.error };
  const final = resultado.asignaciones;

  const repetido = await db.app_usuarios.findFirst({
    where: { nombre_usuario: { equals: datos.nombre_usuario, mode: "insensitive" }, ...(id ? { id_usuario: { not: id } } : {}) },
    select: { id_usuario: true },
  });
  if (repetido) return { error: "Revisa los campos marcados.", errores: { nombre_usuario: "Ya existe un usuario con ese nombre" } };
  if (datos.cedula) {
    const misma = await db.app_usuarios.findFirst({ where: { cedula: datos.cedula, ...(id ? { id_usuario: { not: id } } : {}) }, select: { id_usuario: true } });
    if (misma) return { error: "Revisa los campos marcados.", errores: { cedula: "Ya existe un usuario con esa cédula" } };
  }

  // Nunca dejar el sistema sin administrador activo.
  const eraAdmin = asignacionesAntes?.globales.includes("administrador") && !asignacionesAntes.bloqueado;
  const quedaAdmin = final.globales.includes("administrador") && !final.bloqueado;
  if (id && eraAdmin && !quedaAdmin && (await administradoresActivos(id)) === 0) {
    return { error: "Es el único administrador activo: asigna otro administrador antes." };
  }

  let claveTemporal: string | null = null;
  if (!id) {
    const clave = claveNueva.safeParse(String(formData.get("clave") ?? ""));
    if (!clave.success) return { error: "Revisa los campos marcados.", errores: { clave: clave.error.issues[0]?.message } };
    claveTemporal = clave.data;
  }

  const valores = {
    nombre_usuario: datos.nombre_usuario,
    nombre_apellido: datos.nombre_apellido,
    cedula: datos.cedula,
    cargo: datos.cargo,
    recibe_alertas: datos.recibe_alertas,
    recibe_aprobaciones: datos.recibe_aprobaciones,
  };
  const aFecha = (f: string | null) => (f ? new Date(`${f}T00:00:00Z`) : null);

  let idGuardado: number;
  try {
    idGuardado = await db.$transaction(async (tx) => {
      const guardado = anterior
        ? await tx.app_usuarios.update({ where: { id_usuario: anterior.id_usuario }, data: { ...valores, bloqueado: final.bloqueado, actualizado_en: new Date() } })
        : await tx.app_usuarios.create({
            data: {
              ...valores,
              creado_por: actor.id,
              clave_hash: await bcrypt.hash(claveTemporal!, COSTO_BCRYPT),
              debe_cambiar_clave: true,
              clave_actualizada: new Date(),
            },
          });
      const idU = guardado.id_usuario;

      // Roles globales (aplicarCambios ya conservó lo que el gestor no puede tocar).
      const roles = await tx.app_roles.findMany({ select: { id: true, codigo: true } });
      const idRol = (codigo: string) => roles.find((r) => r.codigo === codigo)!.id;
      await tx.app_usuario_roles.deleteMany({ where: { id_usuario: idU } });
      if (final.globales.length) {
        await tx.app_usuario_roles.createMany({ data: final.globales.map((r) => ({ id_usuario: idU, id_rol: idRol(r) })) });
      }

      // Empresas y excepciones: se reescriben, conservando quién y cuándo asignó lo que no cambió.
      const previos = await tx.app_usuario_empresas.findMany({ where: { id_usuario: idU } });
      await tx.app_usuario_empresas.deleteMany({ where: { id_usuario: idU } });
      for (const a of final.empresas) {
        const p = previos.find((x) => x.empresa === a.empresa && x.id_rol === idRol(a.rol));
        await tx.app_usuario_empresas.create({
          data: {
            id_usuario: idU,
            empresa: a.empresa,
            id_rol: idRol(a.rol),
            vigente_hasta: aFecha(a.vigenteHasta),
            asignado_por: p?.asignado_por ?? actor.id,
            asignado_en: p?.asignado_en ?? new Date(),
          },
        });
      }
      const previasExc = await tx.app_usuario_permisos.findMany({ where: { id_usuario: idU } });
      await tx.app_usuario_permisos.deleteMany({ where: { id_usuario: idU } });
      for (const e of final.excepciones) {
        const p = previasExc.find((x) => x.empresa === e.empresa && x.codigo_permiso === e.permiso);
        await tx.app_usuario_permisos.create({
          data: {
            id_usuario: idU,
            empresa: e.empresa,
            codigo_permiso: e.permiso,
            vigente_hasta: aFecha(e.vigenteHasta),
            asignado_por: p?.asignado_por ?? actor.id,
            asignado_en: p?.asignado_en ?? new Date(),
          },
        });
      }

      const texto = describirCambios(
        idU,
        anterior ? { ...datosBasicos(anterior), ...resumen(asignacionesAntes) } : null,
        { ...valores, ...resumen(final) },
      );
      if (texto) await registrarGestion(actor.id, MODULO_LOG, texto, tx);
      return idU;
    });
  } catch (error) {
    console.error("[guardarUsuario]", error);
    return { error: "No se pudo guardar. Intenta de nuevo." };
  }

  revalidatePath(RUTA);
  if (!id) redirect(`${RUTA}/${idGuardado}?creado=1`);
  revalidatePath(`${RUTA}/${idGuardado}`);
  return { ok: true, mensaje: "Cambios guardados. Los permisos aplican de inmediato." };
}

function datosBasicos(u: {
  nombre_usuario: string;
  nombre_apellido: string;
  cedula: string | null;
  cargo: string | null;
  recibe_alertas: boolean;
  recibe_aprobaciones: boolean;
}) {
  return {
    nombre_usuario: u.nombre_usuario,
    nombre_apellido: u.nombre_apellido,
    cedula: u.cedula,
    cargo: u.cargo,
    recibe_alertas: u.recibe_alertas,
    recibe_aprobaciones: u.recibe_aprobaciones,
  };
}

/** Asigna una clave temporal: el usuario deberá cambiarla al entrar. Quita bloqueos por intentos. */
export async function restablecerClave(_previo: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  const actor = await requerirSesion();
  const id = Number(formData.get("id"));
  const clave = claveNueva.safeParse(String(formData.get("clave") ?? ""));
  if (!clave.success) return { errores: { clave: clave.error.issues[0]?.message } };

  const asignaciones = Number.isInteger(id) ? await leerAsignaciones(id) : null;
  if (!asignaciones) return { error: "El usuario ya no existe." };
  if (!puedeGestionar(comoGestor(actor), asignaciones)) return { error: "Este usuario no pertenece a tus empresas." };

  const usuario = await db.$transaction(async (tx) => {
    const u = await tx.app_usuarios.update({
      where: { id_usuario: id },
      data: {
        clave_hash: await bcrypt.hash(clave.data, COSTO_BCRYPT),
        debe_cambiar_clave: id !== actor.id,
        clave_actualizada: new Date(),
        intentos_fallidos: 0,
        bloqueado_hasta: null,
        actualizado_en: new Date(),
      },
    });
    await registrarGestion(actor.id, MODULO_LOG, `ID ${id} | CLAVE RESTABLECIDA (${u.nombre_usuario})`, tx);
    return u;
  });

  revalidatePath(RUTA);
  revalidatePath(`${RUTA}/${id}`);
  return { ok: true, mensaje: `Clave temporal asignada a ${usuario.nombre_usuario}. Entrégasela: deberá cambiarla al entrar.` };
}

/** Cada usuario cambia su propia clave (obligatorio tras una clave temporal). */
export async function cambiarMiClave(_previo: EstadoUsuario, formData: FormData): Promise<EstadoUsuario> {
  const usuario = await requerirSesionPendiente();
  const entrada = cambioClaveSchema.safeParse({
    actual: String(formData.get("actual") ?? ""),
    nueva: String(formData.get("nueva") ?? ""),
    confirmacion: String(formData.get("confirmacion") ?? ""),
  });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };

  const acceso = await db.app_usuarios.findUnique({ where: { id_usuario: usuario.id }, select: { clave_hash: true } });
  if (!acceso?.clave_hash) return { error: "Tu usuario ya no existe." };
  if (!(await bcrypt.compare(entrada.data.actual, acceso.clave_hash))) return { errores: { actual: "La clave actual no es correcta" } };

  await db.app_usuarios.update({
    where: { id_usuario: usuario.id },
    data: { clave_hash: await bcrypt.hash(entrada.data.nueva, COSTO_BCRYPT), debe_cambiar_clave: false, clave_actualizada: new Date(), actualizado_en: new Date() },
  });
  await registrarGestion(usuario.id, MODULO_LOG, `ID ${usuario.id} | CAMBIO DE CLAVE PROPIA`);
  if (usuario.debeCambiarClave) redirect("/inicio");
  return { ok: true, mensaje: "Clave actualizada." };
}
