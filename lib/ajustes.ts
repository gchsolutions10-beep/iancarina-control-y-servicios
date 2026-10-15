import "server-only";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Permiso } from "@/lib/auth/permisos";

/**
 * Parámetros del sistema guardados en cys.app_ajustes, editables en /ajustes.
 * Cada uno define su validación, su valor por defecto y quién puede cambiarlo.
 */
type Definicion = {
  grupo: string;
  titulo: string;
  detalle: string;
  tipo: "numero" | "texto";
  /** Permiso para cambiarlo (el administrador puede todo salvo lo de desarrollador). */
  editor: Extract<Permiso, "admin.sistema" | "sistema.desarrollador">;
  esquema: z.ZodType<number | string>;
  defecto: number | string;
  ejemplo?: string;
};

export const AJUSTES = {
  "polizas.dias_por_vencer": {
    grupo: "Pólizas",
    titulo: "Días para «por vencer»",
    detalle: "Una póliza se muestra «Por vencer» cuando su vigencia termina dentro de estos días.",
    tipo: "numero",
    editor: "admin.sistema",
    esquema: z.coerce.number().int().min(1).max(365),
    defecto: 30,
  },
  "archivos.tamano_maximo_mb": {
    grupo: "Archivos",
    titulo: "Tamaño máximo por archivo (MB)",
    detalle: "Documentos y fotos. En la demo (Vercel) no puede pasar de 4 MB.",
    tipo: "numero",
    editor: "admin.sistema",
    esquema: z.coerce.number().int().min(1).max(50),
    defecto: 4,
  },
} satisfies Record<string, Definicion>;

export type ClaveAjuste = keyof typeof AJUSTES;
type ValorAjuste<K extends ClaveAjuste> = (typeof AJUSTES)[K]["defecto"];

export const esClaveAjuste = (v: string): v is ClaveAjuste => Object.hasOwn(AJUSTES, v);

const leerTodos = cache(async () => {
  try {
    return new Map((await db.app_ajustes.findMany()).map((a) => [a.clave, a.valor]));
  } catch {
    return new Map<string, unknown>();
  }
});

/** Valor vigente de un ajuste (el de la BD si es válido; si no, el valor por defecto). */
export async function ajuste<K extends ClaveAjuste>(clave: K): Promise<ValorAjuste<K>> {
  const definicion: Definicion = AJUSTES[clave];
  const resultado = definicion.esquema.safeParse((await leerTodos()).get(clave));
  return (resultado.success ? resultado.data : definicion.defecto) as ValorAjuste<K>;
}
