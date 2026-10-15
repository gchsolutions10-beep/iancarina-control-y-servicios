import "server-only";
import { tienePermiso, type UsuarioActual } from "@/lib/auth/dal";
import { AREAS, type Area } from "@/lib/modulos";

/** Áreas, secciones y módulos que el usuario puede ver según sus permisos. */
export function areasVisibles(usuario: UsuarioActual): Area[] {
  return AREAS.map((area) => ({
    ...area,
    secciones: area.secciones
      .map((s) => ({ ...s, modulos: s.modulos.filter((m) => tienePermiso(usuario, m.permiso)) }))
      .filter((s) => s.modulos.length > 0),
  })).filter((area) => area.secciones.length > 0);
}
