import "server-only";
import type { LucideIcon } from "lucide-react";
import { Building2, GitBranch, ListChecks, Settings, SquareFunction, UserCog } from "lucide-react";
import { comoGestor, tienePermiso, type UsuarioActual } from "@/lib/auth/dal";
import { puedeGestionarUsuarios } from "@/lib/usuarios/alcance";

export type OpcionConfiguracion = { id: string; nombre: string; descripcion: string; ruta: string; icono: LucideIcon };

/** Opciones de Configuración que el usuario puede abrir (pestaña «Configuración»). */
export function opcionesConfiguracion(usuario: UsuarioActual): OpcionConfiguracion[] {
  const admin = tienePermiso(usuario, "admin.sistema");
  return [
    ...(puedeGestionarUsuarios(comoGestor(usuario)) ? [{ id: "usuarios", nombre: "Usuarios", descripcion: "Acceso de cada persona por empresa: analista o consulta, permisos y claves", ruta: "/admin/usuarios", icono: UserCog }] : []),
    ...(admin
      ? [
          { id: "empresas", nombre: "Empresas", descripcion: "Empresas del grupo; cada una se maneja por separado", ruta: "/admin/empresas", icono: Building2 },
          { id: "catalogos", nombre: "Catálogos", descripcion: "Listas del sistema: ramos, coberturas, tipos de documento, marcas…", ruta: "/admin/catalogos", icono: ListChecks },
          { id: "reglas", nombre: "Reglas de cálculo", descripcion: "Fórmulas de prima y prorrateo, con versiones y estado «Propuesta» o «Aprobada»", ruta: "/admin/reglas", icono: SquareFunction },
          { id: "flujos", nombre: "Flujos de siniestros", descripcion: "Etapas y documentos requeridos de cada tipo de siniestro", ruta: "/admin/flujos", icono: GitBranch },
        ]
      : []),
    ...(admin || tienePermiso(usuario, "sistema.desarrollador") ? [{ id: "ajustes", nombre: "Ajustes", descripcion: "Plazos de avisos, límites, archivos y otros parámetros", ruta: "/ajustes", icono: Settings }] : []),
  ];
}
