"use server";

import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/lib/auth/dal";
import { describirCambios, describirEliminacion, registrarGestion } from "@/lib/auditoria";
import { db } from "@/lib/db";
import type { EstadoAccion } from "@/lib/estado-accion";
import { describirObjeto, ESQUEMA, SOLO_LECTURA } from "@/lib/base-datos/datos";
import { aTextoConsola, ident } from "@/lib/base-datos/valores";
import { CONFIRMACION, resolverGrupos } from "@/lib/base-datos/grupos";
import { limpiar } from "@/lib/base-datos/limpiar";
import { cargarEjemplos, ejemplosPermitidos } from "@/lib/demo/cargar";

const MODULO_LOG = "BASE DE DATOS";
const LIMITE_RESULTADO = 1000;

type Fila = Record<string, string | null>;
export type ResultadoFila = { ok: boolean; error?: string };

async function tablaEditable(nombre: string) {
  const objeto = await describirObjeto(nombre);
  if (!objeto || objeto.tipo !== "tabla") throw new Error("Solo se pueden editar tablas.");
  if (SOLO_LECTURA.has(nombre)) throw new Error("Esta tabla se gestiona desde su pantalla: aquí es solo lectura.");
  const pk = objeto.columnas.filter((c) => c.pk);
  if (pk.length === 0) throw new Error("La tabla no tiene llave primaria: solo lectura.");
  return { columnas: objeto.columnas, pk };
}

/** Mensaje de PostgreSQL sin el envoltorio de Prisma («Raw query failed. Code… Message: `…`»). */
function mensaje(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e);
  const pg = /Message: `([\s\S]+?)`/.exec(texto);
  return pg ? pg[1] : texto.trim().split("\n").slice(-1)[0] || texto;
}

/** Inserta (pkOriginal null) o modifica una fila. Cada valor se convierte al tipo exacto de su columna. */
export async function guardarFila(tabla: string, pkOriginal: Fila | null, valores: Fila): Promise<ResultadoFila> {
  const actor = await requerirPermiso("admin.sistema");
  try {
    const { columnas, pk } = await tablaEditable(tabla);
    const editables = columnas.filter((c) => c.nombre in valores);
    const params: unknown[] = [];
    const p = (valor: string | null, tipo: string) => {
      params.push(valor);
      return `$${params.length}::${tipo}`;
    };
    const destino = `${ESQUEMA}.${ident(tabla)}`;

    let sql: string;
    if (pkOriginal) {
      const sets = editables.map((c) => `${ident(c.nombre)} = ${p(valores[c.nombre], c.tipo)}`);
      const donde = pk.map((c) => `${ident(c.nombre)} = ${p(pkOriginal[c.nombre], c.tipo)}`);
      sql = `UPDATE ${destino} SET ${sets.join(", ")} WHERE ${donde.join(" AND ")} RETURNING *`;
    } else {
      // Columnas vacías con valor por defecto (p. ej. id serial) se omiten para que lo asigne la base.
      const usar = editables.filter((c) => !(valores[c.nombre] === null && c.defecto));
      sql = usar.length
        ? `INSERT INTO ${destino} (${usar.map((c) => ident(c.nombre)).join(", ")}) VALUES (${usar.map((c) => p(valores[c.nombre], c.tipo)).join(", ")}) RETURNING *`
        : `INSERT INTO ${destino} DEFAULT VALUES RETURNING *`;
    }

    await db.$transaction(async (tx) => {
      const antes = pkOriginal
        ? await tx.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT * FROM ${destino} WHERE ${pk.map((c, i) => `${ident(c.nombre)} = $${i + 1}::${c.tipo}`).join(" AND ")}`,
            ...pk.map((c) => pkOriginal[c.nombre]),
          )
        : [];
      if (pkOriginal && antes.length !== 1) throw new Error("La fila ya no existe o cambió su llave.");
      const resultado = await tx.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...params);
      const despues = resultado[0];
      const texto = (r: Record<string, unknown> | undefined) => (r ? Object.fromEntries(columnas.map((c) => [c.nombre, aTextoConsola(r[c.nombre])])) : null);
      const id = pk.map((c) => aTextoConsola(despues?.[c.nombre])).join("/");
      const cambios = describirCambios(Number(id) || 0, texto(antes[0]), texto(despues)!);
      if (cambios) await registrarGestion(actor.id, MODULO_LOG, `${tabla}: ${cambios.replace(/^ID \d+/, `ID ${id}`)}`, tx, { operacion: "EDITAR FILA", entidad: tabla, idRegistro: id });
    });
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
  revalidatePath("/admin/base-datos", "layout");
  return { ok: true };
}

export async function eliminarFila(tabla: string, pkOriginal: Fila): Promise<ResultadoFila> {
  const actor = await requerirPermiso("admin.sistema");
  try {
    const { columnas, pk } = await tablaEditable(tabla);
    await db.$transaction(async (tx) => {
      const borradas = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
        `DELETE FROM ${ESQUEMA}.${ident(tabla)} WHERE ${pk.map((c, i) => `${ident(c.nombre)} = $${i + 1}::${c.tipo}`).join(" AND ")} RETURNING *`,
        ...pk.map((c) => pkOriginal[c.nombre]),
      );
      if (borradas.length !== 1) throw new Error("La fila ya no existe.");
      const id = pk.map((c) => pkOriginal[c.nombre]).join("/");
      const datos = Object.fromEntries(columnas.map((c) => [c.nombre, aTextoConsola(borradas[0][c.nombre])]));
      await registrarGestion(actor.id, MODULO_LOG, `${tabla}: ${describirEliminacion(Number(id) || 0, datos).replace(/^ID \d+/, `ID ${id}`)}`, tx, { operacion: "ELIMINAR FILA", entidad: tabla, idRegistro: id });
    });
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  }
  revalidatePath("/admin/base-datos", "layout");
  return { ok: true };
}

export type ResultadoSql =
  | { ok: true; columnas: string[]; filas: (string | null)[][]; truncado: boolean; afectadas: number | null; ms: number }
  | { ok: false; error: string };

/**
 * Ejecuta una sentencia SQL (solo administrador). En modo lectura corre en una transacción READ ONLY; en modo
 * escritura queda registrada completa en la bitácora. Límite de 15 s y 1000 filas.
 */
export async function ejecutarSql(sql: string, escritura: boolean): Promise<ResultadoSql> {
  const actor = await requerirPermiso("admin.sistema");
  const sentencia = sql.trim().replace(/;\s*$/, "");
  if (!sentencia) return { ok: false, error: "Escribe una sentencia." };
  if (sentencia.length > 20_000) return { ok: false, error: "Sentencia demasiado larga." };
  const inicio = Date.now();
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(escritura ? "SET LOCAL statement_timeout = '15s'" : "SET TRANSACTION READ ONLY");
        if (!escritura) await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
        if (escritura) await registrarGestion(actor.id, MODULO_LOG, `SQL: ${sentencia}`, tx, { operacion: "SQL" });
        const devuelveFilas = /^\s*(select|with|show|explain|values|table)\b/i.test(sentencia) || /\breturning\b/i.test(sentencia);
        if (!devuelveFilas) {
          const afectadas = await tx.$executeRawUnsafe(sentencia);
          return { ok: true as const, columnas: [], filas: [], truncado: false, afectadas, ms: Date.now() - inicio };
        }
        const filas = await tx.$queryRawUnsafe<Record<string, unknown>[]>(sentencia);
        const columnas = filas[0] ? Object.keys(filas[0]) : [];
        return {
          ok: true as const,
          columnas,
          filas: filas.slice(0, LIMITE_RESULTADO).map((f) => columnas.map((c) => aTextoConsola(f[c]))),
          truncado: filas.length > LIMITE_RESULTADO,
          afectadas: escritura ? filas.length : null,
          ms: Date.now() - inicio,
        };
      },
      { timeout: 20_000 },
    );
  } catch (error) {
    return { ok: false, error: mensaje(error) };
  } finally {
    if (escritura) revalidatePath("/", "layout");
  }
}

// ---------------------------------------------------------------- datos de ejemplo y limpieza

/** Carga los datos de ejemplo en una empresa (solo en la demo). */
export async function cargarDatosEjemplo(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const actor = await requerirPermiso("admin.sistema");
  const empresa = String(fd.get("empresa") ?? "");
  if (!(await db.app_empresas.findUnique({ where: { codigo: empresa } }))) return { errores: { empresa: "Elige la empresa" } };
  if (!ejemplosPermitidos()) return { error: "Los datos de ejemplo solo se cargan en la demo (Vercel), nunca en la base del cliente." };
  try {
    const r = await cargarEjemplos(empresa, actor.id);
    revalidatePath("/", "layout");
    return {
      ok: true,
      mensaje: `Cargados: ${r.personas} personas, ${r.organizaciones} organizaciones, ${r.vehiculos} vehículos, ${r.propiedades} propiedades, ${r.polizas} pólizas (${r.periodos} vigencias, ${r.asegurados} asegurados), ${r.endosos} endosos, ${r.siniestros} siniestros, ${r.pagos} pagos y cobros, y ${r.archivos} archivos.`,
    };
  } catch (error) {
    console.error("[cargarDatosEjemplo]", error);
    return { error: error instanceof Error && !/prisma|invocation/i.test(error.message) ? error.message : "No se pudieron cargar todos los ejemplos. Revisa y limpia antes de reintentar." };
  }
}

/** Limpia los grupos elegidos en las empresas elegidas. Exige escribir LIMPIAR y un motivo. */
export async function limpiarDatos(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const actor = await requerirPermiso("admin.sistema");
  const grupos = resolverGrupos(fd.getAll("grupos").map(String));
  if (grupos.length === 0) return { error: "Marca qué quieres limpiar." };
  const todas = (await db.app_empresas.findMany({ select: { codigo: true } })).map((e) => e.codigo);
  const elegida = String(fd.get("empresa") ?? "");
  const empresas = elegida === "*" ? todas : todas.filter((e) => e === elegida);
  if (empresas.length === 0) return { errores: { empresa: "Elige la empresa" } };
  if (String(fd.get("confirmacion") ?? "").trim() !== CONFIRMACION) return { errores: { confirmacion: `Escribe ${CONFIRMACION} para confirmar` } };
  const motivo = String(fd.get("motivo") ?? "").trim();
  if (motivo.length < 3) return { errores: { motivo: "Indica el motivo" } };
  try {
    const detalle = await limpiar(grupos, empresas, actor.id, motivo);
    revalidatePath("/", "layout");
    return { ok: true, mensaje: detalle.length ? `Limpieza hecha. Borrado: ${detalle.join(" · ")}.` : "No había registros que limpiar." };
  } catch (error) {
    console.error("[limpiarDatos]", error);
    return { error: `No se limpió nada (la operación se deshizo completa): ${mensaje(error)}` };
  }
}
