import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { camposACompletar, COLUMNAS_PARTE, REFERENCIAS_PARTE } from "@/lib/dominio/fusion";
import { Prisma } from "@/lib/generated/prisma/client";
import { nombreParte } from "@/lib/validations/fichas";

/**
 * Consolidación de personas duplicadas (Etapa 2b). La fusión y su reversión ocurren en la base
 * (cys.fusionar_partes / cys.revertir_fusion); aquí se buscan candidatos, se comparan fichas y se
 * listan las fusiones registradas.
 */
const n = (v: bigint) => Number(v);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
/** Similitud mínima de nombres (pg_trgm, 0 a 1) para proponer un par. */
const SIMILITUD_MINIMA = 0.5;

const filaCandidato = z.object({
  empresa: z.string(),
  id_a: z.bigint(),
  id_b: z.bigint(),
  nombre_a: z.string(),
  nombre_b: z.string(),
  ident_a: z.string(),
  ident_b: z.string(),
  similitud: z.number(),
  mismo_numero: z.boolean(),
});

/** Pares de fichas que podrían ser la misma persona: mismo número de identificación o nombre muy parecido. */
export async function candidatosDuplicados(empresas: string[]) {
  if (empresas.length === 0) return [];
  const filas = await db.$queryRaw<unknown[]>`
    WITH p AS (
      SELECT empresa, id, tipo, tipo_identificacion || '-' || numero_identificacion AS ident,
             regexp_replace(numero_identificacion, '\D', '', 'g') AS numero,
             trim(coalesce(nombres, '') || ' ' || coalesce(apellidos, '') || ' ' || coalesce(razon_social, '')) AS nombre
      FROM cys.partes WHERE empresa = ANY(${empresas}::text[]) AND estado <> 'fusionada'
    )
    SELECT a.empresa, a.id AS id_a, b.id AS id_b, a.nombre AS nombre_a, b.nombre AS nombre_b, a.ident AS ident_a, b.ident AS ident_b,
           similarity(a.nombre, b.nombre)::float8 AS similitud, (a.numero <> '' AND a.numero = b.numero) AS mismo_numero
    FROM p a JOIN p b ON b.empresa = a.empresa AND b.tipo = a.tipo AND b.id > a.id
    WHERE ((a.numero <> '' AND a.numero = b.numero) OR similarity(a.nombre, b.nombre) >= ${SIMILITUD_MINIMA})
      AND NOT EXISTS (SELECT 1 FROM cys.personas_distintas d WHERE d.empresa = a.empresa AND d.id_a = a.id AND d.id_b = b.id)
    ORDER BY mismo_numero DESC, similitud DESC
    LIMIT 100`;
  return z.array(filaCandidato).parse(filas).map((f) => ({ ...f, id_a: n(f.id_a), id_b: n(f.id_b) }));
}

/** Cuántas filas de cada tipo apuntan a una ficha (lo que se movería al fusionarla). */
export async function referenciasDe(empresa: string, id: number) {
  // Tablas y columnas fijas (COLUMNAS_PARTE), nunca datos del usuario.
  const partes = Object.entries(COLUMNAS_PARTE).map(([tabla, columna]) => Prisma.sql`SELECT ${tabla}::text AS tabla, count(*)::int AS total FROM ${Prisma.raw(`cys.${tabla}`)} WHERE empresa = ${empresa} AND ${Prisma.raw(columna)} = ${BigInt(id)}`);
  const filas = await db.$queryRaw<{ tabla: string; total: number }[]>(Prisma.join(partes, " UNION ALL "));
  return filas.filter((f) => f.total > 0).map((f) => ({ tabla: f.tabla, etiqueta: REFERENCIAS_PARTE[f.tabla] ?? f.tabla, total: f.total }));
}

/** Cruces que impedirían la fusión: misma póliza (o mismo asegurado como beneficiarios) en fechas que se solapan. */
export async function conflictosFusion(empresa: string, origen: number, destino: number) {
  const [o, d] = [BigInt(origen), BigInt(destino)];
  const filas = await db.$queryRaw<{ detalle: string }[]>`
    SELECT 'Asegurados en la póliza ' || pol.numero || ' (período ' || per.numero_periodo || ')' AS detalle
    FROM cys.inclusiones a
    JOIN cys.inclusiones b ON b.empresa = a.empresa AND b.id_periodo = a.id_periodo AND daterange(a.desde, a.hasta) && daterange(b.desde, b.hasta)
    JOIN cys.poliza_periodos per ON per.id = a.id_periodo JOIN cys.polizas pol ON pol.id = per.id_poliza
    WHERE a.empresa = ${empresa} AND a.id_persona = ${o} AND b.id_persona = ${d}
    UNION
    SELECT 'Beneficiarios del mismo asegurado en la póliza ' || pol.numero AS detalle
    FROM cys.beneficiarios a
    JOIN cys.beneficiarios b ON b.empresa = a.empresa AND b.id_inclusion = a.id_inclusion AND daterange(a.desde, a.hasta) && daterange(b.desde, b.hasta)
    JOIN cys.inclusiones i ON i.id = a.id_inclusion JOIN cys.poliza_periodos per ON per.id = i.id_periodo JOIN cys.polizas pol ON pol.id = per.id_poliza
    WHERE a.empresa = ${empresa} AND a.id_parte = ${o} AND b.id_parte = ${d}`;
  return filas.map((f) => f.detalle);
}

const SELECCION = {
  id: true, empresa: true, tipo: true, tipo_identificacion: true, numero_identificacion: true, nombres: true, apellidos: true, razon_social: true,
  funciones: true, fecha_nacimiento: true, telefono: true, correo: true, direccion: true, estado: true, fusionada_en: true, creado_en: true,
} as const;

/** Las dos fichas lado a lado, con lo que se movería, lo que se completaría y lo que lo impide. */
export async function compararFichas(origen: number, destino: number) {
  const [o, d] = await Promise.all([
    db.partes.findUnique({ where: { id: BigInt(origen) }, select: SELECCION }),
    db.partes.findUnique({ where: { id: BigInt(destino) }, select: SELECCION }),
  ]);
  if (!o || !d) return null;
  const ficha = (p: NonNullable<typeof o>) => ({ ...p, id: n(p.id), fusionada_en: p.fusionada_en ? n(p.fusionada_en) : null, fecha_nacimiento: iso(p.fecha_nacimiento), nombre: nombreParte(p) });
  const fo = ficha(o);
  const fd = ficha(d);
  const bloqueos: string[] = [];
  if (fo.empresa !== fd.empresa) bloqueos.push("Las fichas son de empresas distintas: cada empresa se maneja por separado.");
  if (fo.tipo !== fd.tipo) bloqueos.push("Solo se fusionan fichas del mismo tipo (persona con persona, empresa con empresa).");
  if (fo.estado === "fusionada" || fd.estado === "fusionada") bloqueos.push("Una de las fichas ya está fusionada.");
  const [refOrigen, refDestino, conflictos] = await Promise.all([
    referenciasDe(fo.empresa, origen),
    referenciasDe(fd.empresa, destino),
    fo.empresa === fd.empresa ? conflictosFusion(fo.empresa, origen, destino) : Promise.resolve([]),
  ]);
  return {
    origen: fo,
    destino: fd,
    refOrigen,
    refDestino,
    completar: camposACompletar(fd, fo),
    funcionesNuevas: fo.funciones.filter((x) => !fd.funciones.includes(x)),
    bloqueos: [...bloqueos, ...conflictos.map((c) => `${c}: se cruzan las fechas. Dé de baja una por endoso antes de fusionar.`)],
  };
}

/** Fusiones registradas (las más recientes primero). */
export async function listarFusiones(empresas: string[], ficha?: number) {
  const filas = await db.fusiones_personas.findMany({
    where: { empresa: { in: empresas }, ...(ficha ? { OR: [{ id_origen: BigInt(ficha) }, { id_destino: BigInt(ficha) }] } : {}) },
    orderBy: { id: "desc" },
    take: 100,
    include: {
      partes_fusiones_personas_empresa_id_origenTopartes: { select: { tipo: true, nombres: true, apellidos: true, razon_social: true, tipo_identificacion: true, numero_identificacion: true } },
      partes_fusiones_personas_empresa_id_destinoTopartes: { select: { tipo: true, nombres: true, apellidos: true, razon_social: true, tipo_identificacion: true, numero_identificacion: true } },
      app_usuarios_fusiones_personas_creado_porToapp_usuarios: { select: { nombre_apellido: true } },
      app_usuarios_fusiones_personas_revertida_porToapp_usuarios: { select: { nombre_apellido: true } },
    },
  });
  return filas.map((f) => {
    const o = f.partes_fusiones_personas_empresa_id_origenTopartes;
    const d = f.partes_fusiones_personas_empresa_id_destinoTopartes;
    const movidas = (f.filas as { ids: unknown[] }[]).reduce((s, x) => s + x.ids.length, 0);
    return {
      id: n(f.id),
      empresa: f.empresa,
      idOrigen: n(f.id_origen),
      origen: `${nombreParte(o)} · ${o.tipo_identificacion}-${o.numero_identificacion}`,
      idDestino: n(f.id_destino),
      destino: `${nombreParte(d)} · ${d.tipo_identificacion}-${d.numero_identificacion}`,
      motivo: f.motivo,
      movidas,
      fecha: f.creado_en,
      usuario: f.app_usuarios_fusiones_personas_creado_porToapp_usuarios.nombre_apellido,
      revertida: f.revertida_en ? { fecha: f.revertida_en, usuario: f.app_usuarios_fusiones_personas_revertida_porToapp_usuarios?.nombre_apellido ?? "—", motivo: f.motivo_reversion } : null,
    };
  });
}
