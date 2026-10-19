import "server-only";
import { db } from "@/lib/db";
import { aTextoConsola, IDENTIFICADOR, ident } from "./valores";

export const ESQUEMA = "cys";

/** Tablas que la consola muestra en solo lectura (se gestionan en su pantalla o no se tocan). */
export const SOLO_LECTURA = new Set(["app_usuarios", "app_bitacora", "app_migraciones", "archivos"]);
/** Columnas que nunca se muestran. */
export const OCULTAS = new Set(["clave_hash"]);
export const FILAS_POR_PAGINA = 50;

export type ObjetoBase = { nombre: string; tipo: "tabla" | "vista"; filas: number | null };
export type Columna = { nombre: string; tipo: string; nula: boolean; defecto: string | null; pk: boolean };

export async function listarObjetos(): Promise<ObjetoBase[]> {
  const filas = await db.$queryRaw<{ nombre: string; tipo: string; filas: number | null }[]>`
    SELECT c.relname AS nombre, CASE c.relkind WHEN 'r' THEN 'tabla' ELSE 'vista' END AS tipo,
           CASE WHEN c.relkind = 'r' AND c.reltuples >= 0 THEN c.reltuples::int END AS filas
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ${ESQUEMA} AND c.relkind IN ('r', 'v', 'm')
     ORDER BY c.relkind DESC, c.relname`;
  return filas.map((f) => ({ ...f, tipo: f.tipo as ObjetoBase["tipo"] }));
}

/** Columnas con su tipo exacto (format_type) y si son parte de la llave primaria. */
export async function describirObjeto(nombre: string): Promise<{ tipo: ObjetoBase["tipo"]; columnas: Columna[] } | null> {
  if (!IDENTIFICADOR.test(nombre)) return null;
  const objeto = await db.$queryRaw<{ relkind: string }[]>`
    SELECT c.relkind::text AS relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = ${ESQUEMA} AND c.relname = ${nombre} AND c.relkind IN ('r', 'v', 'm')`;
  if (!objeto[0]) return null;
  const columnas = await db.$queryRaw<Columna[]>`
    SELECT a.attname AS nombre, format_type(a.atttypid, a.atttypmod) AS tipo, NOT a.attnotnull AS nula,
           pg_get_expr(d.adbin, d.adrelid) AS defecto,
           EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS pk
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = format('%I.%I', ${ESQUEMA}::text, ${nombre}::text)::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`;
  return { tipo: objeto[0].relkind === "r" ? "tabla" : "vista", columnas };
}

export type ConsultaFilas = { pagina: number; columna: string | null; valor: string | null; orden: string | null; desc: boolean };

/** Filas paginadas; filtro opcional «columna contiene valor» (texto, sin distinguir mayúsculas). */
export async function leerFilas(nombre: string, columnas: Columna[], c: ConsultaFilas) {
  const nombres = new Set(columnas.map((x) => x.nombre));
  const pk = columnas.filter((x) => x.pk).map((x) => x.nombre);
  const orden = c.orden && nombres.has(c.orden) ? [c.orden] : pk.length ? pk : [columnas[0].nombre];
  const params: unknown[] = [];
  let donde = "";
  if (c.columna && nombres.has(c.columna) && c.valor) {
    params.push(`%${c.valor}%`);
    donde = `WHERE ${ident(c.columna)}::text ILIKE $1`;
  }
  const tabla = `${ESQUEMA}.${ident(nombre)}`;
  const [filas, total] = await Promise.all([
    db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM ${tabla} ${donde} ORDER BY ${orden.map((o) => `${ident(o)} ${c.desc ? "DESC" : "ASC"} NULLS LAST`).join(", ")}
        LIMIT ${FILAS_POR_PAGINA} OFFSET ${Math.max(0, c.pagina - 1) * FILAS_POR_PAGINA}`,
      ...params,
    ),
    db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${tabla} ${donde}`, ...params),
  ]);
  return {
    filas: filas.map((f) => Object.fromEntries(columnas.map((col) => [col.nombre, OCULTAS.has(col.nombre) && f[col.nombre] !== null ? "••••" : aTextoConsola(f[col.nombre])]))),
    total: Number(total[0]?.n ?? 0),
  };
}
