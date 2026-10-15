import "server-only";
import { tienePermiso, type UsuarioActual } from "@/lib/auth/dal";
import { empresasCon, type PermisoEmpresa } from "@/lib/auth/permisos";

/** Empresas donde el usuario tiene el permiso (las listas se limitan siempre a estas). */
export const empresasDe = (u: UsuarioActual, permiso: PermisoEmpresa) => empresasCon(u.acceso, permiso);

/** Mensaje de error si el usuario no puede hacer `permiso` en `empresa`; null si puede. */
export function sinPermiso(u: UsuarioActual, empresa: string, permiso: PermisoEmpresa): string | null {
  if (tienePermiso(u, permiso, empresa)) return null;
  return permiso === "seguros.registrar" ? "Tu usuario solo puede consultar en esta empresa." : "No tienes acceso a este registro.";
}

/** Código de error de PostgreSQL dentro de un error de Prisma (23505 único, 23P01 exclusión, 23503 llave). */
export function codigoPg(error: unknown): string | null {
  const texto = error instanceof Error ? error.message : String(error);
  const m = texto.match(/\b(23505|23P01|23503|23514)\b/);
  if (m) return m[1];
  const e = error as { code?: string; meta?: { code?: string } };
  if (e?.code === "P2002") return "23505";
  return e?.meta?.code ?? null;
}
