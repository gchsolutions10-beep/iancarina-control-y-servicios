/**
 * Reglas de quién puede gestionar a quién (lógica pura, probada en tests/alcance-usuarios.test.ts).
 *
 * - El administrador gestiona usuarios de cualquier empresa.
 * - Un gerente (o un usuario de confianza con «usuarios.gestionar») gestiona solo SUS empresas:
 *   las asignaciones del usuario en otros empresas se conservan tal cual.
 * - Nadie asigna un rol de más jerarquía que el suyo en ese empresa, ni otorga un permiso
 *   que él mismo no tiene allí (así un gerente puede dejar a alguien cubriendo sus vacaciones).
 * - El rol global de administrador solo lo asigna otro administrador;
 *   «desarrollador» nunca desde la web (lo asigna npm run usuario:soporte).
 */
import {
  accesoTotal,
  empresasCon,
  tieneAcceso,
  type Acceso,
  type Empresa,
  type PermisoEmpresa,
} from "@/lib/auth/permisos";

export const ROLES_EMPRESA = [
  { codigo: "analista", nombre: "Analista", nivel: 10 },
  { codigo: "consulta", nombre: "Consulta (solo ver)", nivel: 5 },
] as const;

export const ROLES_GLOBALES = [
  { codigo: "administrador", nombre: "Administrador / Programador" },
  { codigo: "desarrollador", nombre: "Desarrollador (GCH)" },
] as const;

export type RolEmpresa = (typeof ROLES_EMPRESA)[number]["codigo"];
export type RolGlobal = (typeof ROLES_GLOBALES)[number]["codigo"];

/** Permisos que se pueden dar como excepción, además de los del rol. */
export const PERMISOS_EXCEPCIONALES: { codigo: PermisoEmpresa; nombre: string; detalle: string }[] = [
  { codigo: "usuarios.gestionar", nombre: "Gestionar usuarios", detalle: "Crear y modificar usuarios de esta empresa" },
  { codigo: "seguros.registrar", nombre: "Ingresar información", detalle: "Para un usuario de consulta que deba registrar algo puntual" },
  { codigo: "personas.datos_sensibles", nombre: "Ver datos personales", detalle: "Fecha de nacimiento, contacto, dirección y siniestros de personas" },
  { codigo: "movimientos.anular", nombre: "Anular y ajustar", detalle: "Anular pagos, cobros y obligaciones, y ajustar importes calculados" },
];

export const nivelRol = (codigo: string) => ROLES_EMPRESA.find((r) => r.codigo === codigo)?.nivel ?? 0;
export const esRolEmpresa = (v: string): v is RolEmpresa => ROLES_EMPRESA.some((r) => r.codigo === v);
export const esRolGlobal = (v: string): v is RolGlobal => ROLES_GLOBALES.some((r) => r.codigo === v);

export type Asignacion = { empresa: Empresa; rol: RolEmpresa; vigenteHasta: string | null };
export type Excepcion = { empresa: Empresa; permiso: PermisoEmpresa; vigenteHasta: string | null };

/** Permisos y jerarquía de un usuario, tal como se guardan. */
export type Asignaciones = {
  globales: RolGlobal[];
  empresas: Asignacion[];
  excepciones: Excepcion[];
  bloqueado: boolean;
};

export type Gestor = {
  id: number;
  acceso: Acceso;
  /** Rol vigente del gestor en cada empresa (para limitar qué puede asignar). */
  roles: Partial<Record<Empresa, RolEmpresa>>;
};

export const esAdministrador = (g: Gestor) => g.acceso.globales.includes("admin.sistema");

/** Empresas cuyos usuarios puede gestionar. */
export function empresasGestionables(g: Gestor): Empresa[] {
  return empresasCon(g.acceso, "usuarios.gestionar");
}

export const puedeGestionarUsuarios = (g: Gestor) => empresasGestionables(g).length > 0;

/** Roles que puede asignar en una empresa (hasta su propia jerarquía). */
export function rolesAsignables(g: Gestor, empresa: Empresa): RolEmpresa[] {
  if (!empresasGestionables(g).includes(empresa)) return [];
  if (accesoTotal(g.acceso)) return ROLES_EMPRESA.map((r) => r.codigo);
  const propio = nivelRol(g.roles[empresa] ?? "");
  return ROLES_EMPRESA.filter((r) => r.nivel <= propio).map((r) => r.codigo);
}

/** Permisos excepcionales que puede otorgar en una empresa (los que él mismo tiene allí). */
export function excepcionesOtorgables(g: Gestor, empresa: Empresa): PermisoEmpresa[] {
  if (!empresasGestionables(g).includes(empresa)) return [];
  return PERMISOS_EXCEPCIONALES.map((p) => p.codigo).filter((p) => tieneAcceso(g.acceso, p, empresa));
}

/**
 * ¿Puede abrir y modificar a este usuario?
 * - Usuarios con rol global: solo el administrador.
 * - Sin acceso total: el usuario debe pertenecer a uno de sus empresas, o a ninguno
 *   (recién creado o retirado de todos, para poder reasignarlo).
 */
export function puedeGestionar(g: Gestor, objetivo: Asignaciones): boolean {
  if (!puedeGestionarUsuarios(g)) return false;
  if (objetivo.globales.length > 0) return esAdministrador(g);
  if (accesoTotal(g.acceso)) return true;
  if (objetivo.empresas.length === 0) return true;
  const mios = empresasGestionables(g);
  return objetivo.empresas.some((a) => mios.includes(a.empresa));
}

export type ResultadoCambio = { ok: true; asignaciones: Asignaciones } | { ok: false; error: string };

/**
 * Valida la propuesta y devuelve las asignaciones finales: en las empresas que el gestor
 * no administra se conserva lo que había, aunque la propuesta diga otra cosa.
 * `anterior` es null al crear un usuario; `idObjetivo` es null al crear.
 */
export function aplicarCambios(
  g: Gestor,
  idObjetivo: number | null,
  anterior: Asignaciones | null,
  propuesta: Asignaciones,
): ResultadoCambio {
  const base: Asignaciones = anterior ?? { globales: [], empresas: [], excepciones: [], bloqueado: false };
  if (!puedeGestionarUsuarios(g)) return { ok: false, error: "No tienes permiso para gestionar usuarios." };
  if (anterior && !puedeGestionar(g, anterior)) return { ok: false, error: "Este usuario no pertenece a tus empresas." };

  const unoMismo = idObjetivo !== null && idObjetivo === g.id;
  const mios = new Set(empresasGestionables(g));

  // Roles globales: solo el administrador; «desarrollador» se conserva como estaba.
  const globales = esAdministrador(g)
    ? [...new Set([...propuesta.globales.filter((r) => r !== "desarrollador"), ...base.globales.filter((r) => r === "desarrollador")])]
    : base.globales;
  if (unoMismo && base.globales.includes("administrador") && !globales.includes("administrador")) {
    return { ok: false, error: "No puedes quitarte el rol de administrador." };
  }

  // Nadie cambia sus propios permisos de empresa (evita que alguien se dé más acceso),
  // salvo el administrador, que ya tiene todos.
  const puedeTocarEmpresas = !unoMismo || esAdministrador(g);

  const empresas: Asignacion[] = [];
  const excepciones: Excepcion[] = [];
  const todas = [...new Set([...g.acceso.todas, ...base.empresas.map((a) => a.empresa), ...base.excepciones.map((e) => e.empresa)])];
  for (const d of todas) {
    if (!mios.has(d) || !puedeTocarEmpresas) {
      empresas.push(...base.empresas.filter((a) => a.empresa === d));
      excepciones.push(...base.excepciones.filter((e) => e.empresa === d));
      continue;
    }
    const asignadas = propuesta.empresas.filter((a) => a.empresa === d);
    if (asignadas.length > 1) return { ok: false, error: "Un usuario tiene un solo rol por empresa." };
    const nueva = asignadas[0];
    if (nueva) {
      const antes = base.empresas.find((a) => a.empresa === d);
      const sinCambio = antes && antes.rol === nueva.rol;
      if (!sinCambio && !rolesAsignables(g, d).includes(nueva.rol)) {
        return { ok: false, error: `No puedes asignar el rol «${nueva.rol}» en ${d}.` };
      }
      empresas.push(nueva);
    }
    const otorgables = excepcionesOtorgables(g, d);
    for (const e of propuesta.excepciones.filter((x) => x.empresa === d)) {
      const yaTenia = base.excepciones.some((x) => x.empresa === d && x.permiso === e.permiso);
      if (!yaTenia && !otorgables.includes(e.permiso)) {
        return { ok: false, error: `No puedes otorgar «${e.permiso}» en ${d}.` };
      }
      if (!nueva) return { ok: false, error: "Para dar un permiso excepcional en una empresa, asigna primero un rol allí." };
      excepciones.push(e);
    }
  }

  // Bloquear: afecta todo el sistema, así que exige poder sobre todos las empresas del usuario.
  let bloqueado = base.bloqueado;
  if (propuesta.bloqueado !== base.bloqueado) {
    if (unoMismo) return { ok: false, error: "No puedes bloquear tu propio usuario." };
    const fuera = base.empresas.some((a) => !mios.has(a.empresa));
    if (fuera) {
      return { ok: false, error: "El usuario también pertenece a otros empresas: quítalo de los tuyos en lugar de bloquearlo." };
    }
    bloqueado = propuesta.bloqueado;
  }

  return { ok: true, asignaciones: { globales, empresas, excepciones, bloqueado } };
}
