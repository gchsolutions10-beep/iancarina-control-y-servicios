import "server-only";
import type { UsuarioActual } from "@/lib/auth/dal";
import { listarEmpresas } from "@/lib/empresas";
import { empresasDe } from "./acceso";

type Params = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

/** Filtros comunes de los listados (en la URL) y empresas visibles del usuario. */
export async function leerFiltros(usuario: UsuarioActual, p: Params) {
  const visibles = empresasDe(usuario, "seguros.ver");
  const registrar = empresasDe(usuario, "seguros.registrar");
  const nombres = Object.fromEntries((await listarEmpresas()).map((e) => [e.codigo, e.nombre]));
  const empresa = visibles.includes(uno(p.empresa)) ? uno(p.empresa) : "";
  const pagina = Math.max(1, Number(uno(p.pagina)) || 1);
  return {
    q: uno(p.q),
    estado: uno(p.estado),
    tipo: uno(p.tipo),
    empresa,
    pagina,
    /** Empresas que se consultan: la elegida o todas las visibles. */
    empresas: empresa ? [empresa] : visibles,
    opcionesEmpresa: visibles.map((c) => ({ valor: c, etiqueta: nombres[c] ?? c })),
    empresasRegistrar: registrar.map((c) => ({ valor: c, etiqueta: nombres[c] ?? c })),
    nombreEmpresa: (c: string) => nombres[c] ?? c,
  };
}

/** Enlace a la misma lista con otros filtros. */
export function enlace(base: string, filtros: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v !== undefined && v !== "" && !(k === "pagina" && v === 1)) q.set(k, String(v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
