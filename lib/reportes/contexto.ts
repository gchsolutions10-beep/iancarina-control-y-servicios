import "server-only";
import type { UsuarioActual } from "@/lib/auth/dal";
import { listarEmpresas } from "@/lib/empresas";
import { empresasDe } from "@/lib/fichas/acceso";
import { hoyPlanta } from "@/lib/tiempo";
import type { Contexto } from "./definiciones";

/** Contexto de un reporte: empresas visibles del usuario y las que le muestran datos personales. */
export async function contextoReporte(usuario: UsuarioActual): Promise<Contexto> {
  const empresas = empresasDe(usuario, "seguros.ver");
  const nombres = Object.fromEntries((await listarEmpresas()).map((e) => [e.codigo, e.nombre]));
  return {
    empresas,
    sensibles: empresasDe(usuario, "personas.datos_sensibles"),
    nombreEmpresa: (c) => nombres[c] ?? c,
    hoy: hoyPlanta(),
    opcionesEmpresa: empresas.map((c) => ({ valor: c, etiqueta: nombres[c] ?? c })),
  };
}
