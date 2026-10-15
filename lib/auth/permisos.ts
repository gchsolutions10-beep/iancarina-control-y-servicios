/**
 * Catálogo de permisos. Debe coincidir con cys.app_permisos (db/migraciones/001_sistema_base.sql).
 *
 * Las empresas son datos (cys.app_empresas), no constantes: cada usuario tiene un rol por
 * empresa y solo ve la información de las empresas donde lo tiene. Las empresas se manejan
 * por separado (confirmado por el cliente).
 *
 * Este archivo es lógica pura (sin BD) para poder probarlo en tests/permisos.test.ts.
 */

/** Código de una empresa (cys.app_empresas.codigo). */
export type Empresa = string;

/** Permisos que aplican a todo el sistema (vienen de un rol global). */
export const PERMISOS_GLOBALES = ["admin.sistema", "sistema.desarrollador"] as const;

/** Permisos que se tienen EN una empresa (vienen del rol en esa empresa o de una excepción). */
export const PERMISOS_EMPRESA = [
  "empresa.acceso",
  "usuarios.gestionar",
  "seguros.ver",
  "seguros.registrar",
  "personas.datos_sensibles",
  "movimientos.anular",
] as const;

export type PermisoGlobal = (typeof PERMISOS_GLOBALES)[number];
export type PermisoEmpresa = (typeof PERMISOS_EMPRESA)[number];
export type Permiso = PermisoGlobal | PermisoEmpresa;

export const esPermisoGlobal = (v: string): v is PermisoGlobal => (PERMISOS_GLOBALES as readonly string[]).includes(v);
export const esPermisoEmpresa = (v: string): v is PermisoEmpresa => (PERMISOS_EMPRESA as readonly string[]).includes(v);

/** Lo mínimo que hace falta saber de un usuario para decidir qué puede hacer. */
export type Acceso = {
  globales: PermisoGlobal[];
  /** Permisos vigentes por empresa (rol + excepciones). */
  empresas: Partial<Record<Empresa, PermisoEmpresa[]>>;
  /** Empresas activas del sistema (el administrador las ve todas). */
  todas: Empresa[];
};

/** Administrador: acceso total. */
export const accesoTotal = (a: Acceso) => a.globales.includes("admin.sistema");

/**
 * ¿Tiene el permiso? Con `empresa`, lo exige en esa empresa; sin ella, en cualquiera.
 * El administrador tiene todo, salvo «sistema.desarrollador» (solo la cuenta técnica de GCH).
 */
export function tieneAcceso(a: Acceso, permiso: Permiso, empresa?: Empresa): boolean {
  if (permiso === "sistema.desarrollador") return a.globales.includes(permiso);
  if (a.globales.includes("admin.sistema")) return empresa === undefined || a.todas.includes(empresa);
  if (esPermisoGlobal(permiso)) return a.globales.includes(permiso);
  if (empresa !== undefined) return a.empresas[empresa]?.includes(permiso) ?? false;
  return Object.values(a.empresas).some((lista) => lista?.includes(permiso));
}

/** Empresas en las que tiene el permiso (todas las activas si es administrador). */
export function empresasCon(a: Acceso, permiso: PermisoEmpresa): Empresa[] {
  return a.todas.filter((e) => tieneAcceso(a, permiso, e));
}

/** Una asignación con fecha deja de valer al terminar ese día (fechas 'AAAA-MM-DD' de la zona de la empresa). */
export const vigente = (vigenteHasta: string | null, hoy: string) => vigenteHasta === null || vigenteHasta >= hoy;
