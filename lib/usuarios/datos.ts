import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { esPermisoEmpresa, vigente } from "@/lib/auth/permisos";
import { nombresEmpresas } from "@/lib/empresas";
import { hoyPlanta } from "@/lib/tiempo";
import { esRolEmpresa, esRolGlobal, puedeGestionar, ROLES_EMPRESA, type Asignaciones, type Gestor } from "./alcance";

type Cliente = typeof db | Prisma.TransactionClient;

const aFecha = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const SELECCION = {
  bloqueado: true,
  app_usuario_roles: { select: { app_roles: { select: { codigo: true } } } },
  empresas: { select: { empresa: true, vigente_hasta: true, app_roles: { select: { codigo: true } } } },
  permisos_extra: { select: { empresa: true, codigo_permiso: true, vigente_hasta: true } },
} satisfies Prisma.app_usuariosSelect;

type FilaAsignaciones = Prisma.app_usuariosGetPayload<{ select: typeof SELECCION }>;

function aAsignaciones(u: FilaAsignaciones): Asignaciones {
  return {
    globales: u.app_usuario_roles.map((r) => r.app_roles.codigo).filter(esRolGlobal),
    empresas: u.empresas.flatMap((a) =>
      esRolEmpresa(a.app_roles.codigo)
        ? [{ empresa: a.empresa, rol: a.app_roles.codigo, vigenteHasta: aFecha(a.vigente_hasta) }]
        : [],
    ),
    excepciones: u.permisos_extra.flatMap((e) =>
      esPermisoEmpresa(e.codigo_permiso)
        ? [{ empresa: e.empresa, permiso: e.codigo_permiso, vigenteHasta: aFecha(e.vigente_hasta) }]
        : [],
    ),
    bloqueado: u.bloqueado,
  };
}

export async function leerAsignaciones(id: number, cliente: Cliente = db): Promise<Asignaciones | null> {
  const u = await cliente.app_usuarios.findUnique({ where: { id_usuario: id }, select: SELECCION });
  return u ? aAsignaciones(u) : null;
}

/** Usuarios que el gestor puede administrar (todos si es administrador). */
export async function listarUsuarios(gestor: Gestor) {
  const filas = await db.app_usuarios.findMany({
    orderBy: [{ nombre_apellido: "asc" }, { nombre_usuario: "asc" }],
    select: {
      ...SELECCION,
      id_usuario: true,
      nombre_usuario: true,
      nombre_apellido: true,
      cargo: true,
      bloqueado_hasta: true,
      debe_cambiar_clave: true,
      ultimo_acceso: true,
      recibe_alertas: true,
      recibe_aprobaciones: true,
    },
  });
  const hoy = hoyPlanta();
  const nombres = await nombresEmpresas();
  const nombreRol = (codigo: string) => ROLES_EMPRESA.find((r) => r.codigo === codigo)?.nombre ?? codigo;
  return filas
    .map((u) => ({ u, asignaciones: aAsignaciones(u) }))
    .filter(({ asignaciones }) => puedeGestionar(gestor, asignaciones))
    .map(({ u, asignaciones }) => ({
      id: u.id_usuario,
      usuario: u.nombre_usuario,
      nombre: u.nombre_apellido.trim() || u.nombre_usuario,
      cargo: u.cargo,
      bloqueado: u.bloqueado,
      bloqueoTemporal: u.bloqueado_hasta && u.bloqueado_hasta > new Date() ? u.bloqueado_hasta : null,
      claveTemporal: u.debe_cambiar_clave,
      ultimoAcceso: u.ultimo_acceso,
      globales: asignaciones.globales,
      empresas: asignaciones.empresas.map((a) => ({
        texto: `${nombres[a.empresa] ?? a.empresa} · ${nombreRol(a.rol)}`,
        vencida: !vigente(a.vigenteHasta, hoy),
        hasta: a.vigenteHasta,
      })),
    }));
}

export type FilaUsuario = Awaited<ReturnType<typeof listarUsuarios>>[number];

export async function obtenerUsuarioAdmin(id: number) {
  const u = await db.app_usuarios.findUnique({
    where: { id_usuario: id },
    select: {
      ...SELECCION,
      id_usuario: true,
      nombre_usuario: true,
      nombre_apellido: true,
      cedula: true,
      cargo: true,
      debe_cambiar_clave: true,
      ultimo_acceso: true,
      recibe_alertas: true,
      recibe_aprobaciones: true,
    },
  });
  return u ? { ...u, asignaciones: aAsignaciones(u) } : null;
}

/** Administradores activos (para no dejar el sistema sin ninguno). */
export async function administradoresActivos(excluir: number | null, cliente: Cliente = db) {
  return cliente.app_usuarios.count({
    where: {
      bloqueado: false,
      app_usuario_roles: { some: { app_roles: { codigo: "administrador" } } },
      ...(excluir ? { id_usuario: { not: excluir } } : {}),
    },
  });
}
