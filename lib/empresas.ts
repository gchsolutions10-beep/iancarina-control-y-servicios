import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/** Empresas del sistema (activas e inactivas), en el orden configurado. */
export const listarEmpresas = cache(async () =>
  db.app_empresas.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }], select: { codigo: true, nombre: true, rif: true, orden: true, activa: true } }),
);

/** Nombre visible de cada empresa por su código. */
export async function nombresEmpresas(): Promise<Record<string, string>> {
  return Object.fromEntries((await listarEmpresas()).map((e) => [e.codigo, e.nombre]));
}
