import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hoyPlanta } from "@/lib/tiempo";
import type { Gestor, RolEmpresa } from "@/lib/usuarios/alcance";
import { esRolEmpresa } from "@/lib/usuarios/alcance";
import { COOKIE_SESION, verificarSesion } from "./sesion";
import {
  esPermisoEmpresa,
  esPermisoGlobal,
  tieneAcceso,
  vigente,
  type Acceso,
  type Empresa,
  type Permiso,
  type PermisoEmpresa,
} from "./permisos";

export type UsuarioActual = {
  id: number;
  usuario: string;
  nombre: string;
  cargo: string | null;
  acceso: Acceso;
  /** Rol vigente en cada empresa. */
  roles: Partial<Record<Empresa, RolEmpresa>>;
  /** Nombre del rol más alto, para mostrar junto al nombre. */
  rolVisible: string | null;
  /** Clave temporal asignada por un gestor: debe cambiarla antes de seguir. */
  debeCambiarClave: boolean;
  /** Qué notificaciones recibe (se marcan en Usuarios); siempre limitadas a lo que puede ver. */
  notificaciones: { alertas: boolean; aprobaciones: boolean };
};

const aFecha = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Data Access Layer de autenticación. Valida la cookie y relee el usuario, sus roles y
 * permisos desde la BD (una vez por petición gracias a `cache`). Devuelve null si la sesión
 * no es válida o el usuario fue bloqueado después de iniciar sesión.
 */
export const obtenerUsuarioActual = cache(async (): Promise<UsuarioActual | null> => {
  const sesion = await verificarSesion((await cookies()).get(COOKIE_SESION)?.value);
  if (!sesion) return null;

  const u = await db.app_usuarios.findUnique({
    where: { id_usuario: Number(sesion.sub) },
    select: {
      nombre_usuario: true,
      nombre_apellido: true,
      cargo: true,
      bloqueado: true,
      debe_cambiar_clave: true,
      recibe_alertas: true,
      recibe_aprobaciones: true,
      app_usuario_roles: {
        where: { app_roles: { activo: true } },
        select: { app_roles: { select: { nombre: true, nivel: true, app_rol_permisos: { select: { codigo_permiso: true } } } } },
      },
      empresas: {
        where: { app_roles: { activo: true } },
        select: {
          empresa: true,
          vigente_hasta: true,
          app_roles: { select: { codigo: true, nombre: true, nivel: true, app_rol_permisos: { select: { codigo_permiso: true } } } },
        },
      },
      permisos_extra: { select: { empresa: true, codigo_permiso: true, vigente_hasta: true } },
    },
  });
  if (!u || u.bloqueado) return null;

  const todas = (await db.app_empresas.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { nombre: "asc" }], select: { codigo: true } })).map((e) => e.codigo);

  const hoy = hoyPlanta();
  const globales = new Set<Acceso["globales"][number]>();
  for (const { app_roles } of u.app_usuario_roles) {
    for (const { codigo_permiso } of app_roles.app_rol_permisos) if (esPermisoGlobal(codigo_permiso)) globales.add(codigo_permiso);
  }

  const porEmpresa: Partial<Record<Empresa, Set<PermisoEmpresa>>> = {};
  const roles: UsuarioActual["roles"] = {};
  const vigentes = u.empresas.filter((a) => todas.includes(a.empresa) && vigente(aFecha(a.vigente_hasta), hoy));
  for (const a of vigentes) {
    const d = a.empresa as Empresa;
    if (esRolEmpresa(a.app_roles.codigo)) roles[d] = a.app_roles.codigo;
    const lista = (porEmpresa[d] ??= new Set());
    for (const { codigo_permiso } of a.app_roles.app_rol_permisos) if (esPermisoEmpresa(codigo_permiso)) lista.add(codigo_permiso);
  }
  // Las excepciones solo valen en empresas donde tiene un rol vigente.
  for (const e of u.permisos_extra) {
    const lista = porEmpresa[e.empresa];
    if (lista && esPermisoEmpresa(e.codigo_permiso) && vigente(aFecha(e.vigente_hasta), hoy)) lista.add(e.codigo_permiso);
  }

  const visibles = [...u.app_usuario_roles.map((r) => r.app_roles), ...vigentes.map((a) => a.app_roles)].filter((r) => r.nivel > 0);
  const rolVisible = visibles.sort((a, b) => b.nivel - a.nivel)[0]?.nombre ?? null;

  return {
    id: Number(sesion.sub),
    usuario: u.nombre_usuario,
    nombre: u.nombre_apellido.trim() || u.nombre_usuario,
    cargo: u.cargo,
    acceso: {
      globales: [...globales],
      empresas: Object.fromEntries(Object.entries(porEmpresa).map(([d, s]) => [d, [...(s ?? [])]])),
      todas,
    },
    roles,
    rolVisible,
    debeCambiarClave: u.debe_cambiar_clave,
    notificaciones: { alertas: u.recibe_alertas, aprobaciones: u.recibe_aprobaciones },
  };
});

export function tienePermiso(usuario: UsuarioActual, permiso: Permiso, empresa?: Empresa): boolean {
  return tieneAcceso(usuario.acceso, permiso, empresa);
}

export const comoGestor = (u: UsuarioActual): Gestor => ({ id: u.id, acceso: u.acceso, roles: u.roles });

export async function requerirSesion(): Promise<UsuarioActual> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) redirect("/salir");
  if (usuario.debeCambiarClave) redirect("/cuenta/clave");
  return usuario;
}

/** Sesión válida aunque tenga un cambio de clave pendiente (solo para la página de cambio de clave). */
export async function requerirSesionPendiente(): Promise<UsuarioActual> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) redirect("/salir");
  return usuario;
}

export async function requerirPermiso(permiso: Permiso, empresa?: Empresa): Promise<UsuarioActual> {
  const usuario = await requerirSesion();
  if (!tienePermiso(usuario, permiso, empresa)) redirect("/sin-acceso");
  return usuario;
}
