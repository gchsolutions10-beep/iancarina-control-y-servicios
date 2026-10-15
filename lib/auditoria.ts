import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ahoraPlanta } from "@/lib/tiempo";

type Cliente = typeof db | Prisma.TransactionClient;

/**
 * Escribe en la bitácora de la web cys.app_bitacora (mismo formato que tgesth de Access).
 * Dentro de una transacción, pasa el cliente `tx` para que se confirme junto al cambio.
 */
export async function registrarGestion(idUsuario: number | null, modulo: string, descripcion: string, cliente: Cliente = db) {
  await cliente.app_bitacora.create({
    data: { id_usuario_gestion: idUsuario, fecha_gestion: ahoraPlanta(), modulo, descripcion },
  });
}

type Valor = string | number | boolean | Date | null | undefined | { toString(): string };

function texto(valor: Valor): string {
  if (valor === null || valor === undefined || valor === "") return "null";
  if (valor instanceof Date) return valor.toISOString().slice(0, 19).replace("T", " ").replace(" 00:00:00", "");
  return String(valor);
}

/**
 * Describe los cambios con el mismo formato que AuditoriaGlobal de Access:
 * "ID 57 | [campo]: 'antes' -> 'después'; ". Devuelve null si nada cambió.
 */
export function describirCambios(id: number, antes: Record<string, Valor> | null, despues: Record<string, Valor>): string | null {
  const cambios = Object.keys(despues)
    .filter((campo) => texto(antes?.[campo]) !== texto(despues[campo]))
    .map((campo) => `[${campo}]: '${texto(antes?.[campo])}' -> '${texto(despues[campo])}'; `);
  if (cambios.length === 0) return null;
  return `ID ${id} | ${antes ? "" : "NUEVO: "}${cambios.join("")}`.trim();
}

/** Resumen de un registro eliminado (AuditoriaEliminacion de Access). */
export function describirEliminacion(id: number, registro: Record<string, Valor>): string {
  const campos = Object.entries(registro)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([campo, v]) => `[${campo}]: ${texto(v)}; `)
    .join("");
  return `ID ${id} | REGISTRO ELIMINADO. Datos rescatados: ${campos}`.trim();
}
