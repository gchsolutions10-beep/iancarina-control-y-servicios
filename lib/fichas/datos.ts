import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { nombreParte } from "@/lib/validations/fichas";

/**
 * Consultas de la Etapa 2. Toda lista recibe las empresas visibles del usuario; las fichas
 * individuales devuelven su empresa para que la página verifique el permiso.
 * Los id bigint se devuelven como number (caben de sobra) para poder pasarlos al cliente.
 */
const n = (v: bigint) => Number(v);
export const POR_PAGINA = 25;

const aFecha = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// ---------------------------------------------------------------- catálogos
export async function valoresCatalogo(lista: string) {
  const filas = await db.catalogo_valores.findMany({ where: { lista, activo: true }, orderBy: [{ orden: "asc" }, { nombre: "asc" }], select: { nombre: true } });
  return filas.map((f) => ({ valor: f.nombre, etiqueta: f.nombre }));
}

export async function modelosConMarca() {
  const filas = await db.modelos.findMany({
    where: { activo: true, marcas: { activo: true } },
    orderBy: [{ marcas: { nombre: "asc" } }, { nombre: "asc" }],
    select: { id: true, nombre: true, marcas: { select: { nombre: true } } },
  });
  return filas.map((m) => ({ valor: String(m.id), etiqueta: `${m.marcas.nombre} ${m.nombre}` }));
}

// ---------------------------------------------------------------- personas
export type FiltroPartes = { empresas: string[]; q: string; tipo: "" | "natural" | "juridica"; pagina: number };

export async function listarPartes(f: FiltroPartes) {
  const q = f.q.trim();
  const where: Prisma.partesWhereInput = {
    empresa: { in: f.empresas },
    estado: { not: "fusionada" },
    ...(f.tipo ? { tipo: f.tipo } : {}),
    ...(q
      ? {
          OR: [
            { nombres: { contains: q, mode: "insensitive" } },
            { apellidos: { contains: q, mode: "insensitive" } },
            { razon_social: { contains: q, mode: "insensitive" } },
            { identificacion_normalizada: { contains: q.replace(/[^A-Za-z0-9]/g, "").toUpperCase() } },
          ],
        }
      : {}),
  };
  const [total, filas] = await Promise.all([
    db.partes.count({ where }),
    db.partes.findMany({
      where,
      orderBy: [{ razon_social: "asc" }, { apellidos: "asc" }, { nombres: "asc" }],
      skip: (f.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: { id: true, empresa: true, tipo: true, tipo_identificacion: true, numero_identificacion: true, nombres: true, apellidos: true, razon_social: true, funciones: true, estado: true },
    }),
  ]);
  return { total, filas: filas.map((p) => ({ ...p, id: n(p.id), nombre: nombreParte(p) })) };
}

export async function obtenerParte(id: number) {
  const p = await db.partes.findUnique({ where: { id: BigInt(id) } });
  if (!p) return null;
  return { ...p, id: n(p.id), fusionada_en: p.fusionada_en ? n(p.fusionada_en) : null, fecha_nacimiento: aFecha(p.fecha_nacimiento), nombre: nombreParte(p) };
}

/** Partes activas de una empresa para elegir en un selector (titulares, etc.). */
export async function opcionesPartes(empresa: string) {
  const filas = await db.partes.findMany({
    where: { empresa, estado: "activa" },
    orderBy: [{ razon_social: "asc" }, { apellidos: "asc" }],
    select: { id: true, tipo: true, nombres: true, apellidos: true, razon_social: true, tipo_identificacion: true, numero_identificacion: true },
  });
  return filas.map((p) => ({ valor: String(p.id), etiqueta: `${nombreParte(p)} · ${p.tipo_identificacion}-${p.numero_identificacion}` }));
}

/** Posibles duplicados por nombre parecido dentro de la misma empresa (pg_trgm). */
export async function partesParecidas(empresa: string, nombre: string, excluir?: number) {
  if (nombre.trim().length < 4) return [];
  const filas = await db.$queryRaw<{ id: bigint; nombre: string; identificacion: string; similitud: number }[]>`
    SELECT id, trim(coalesce(nombres,'') || ' ' || coalesce(apellidos,'') || coalesce(razon_social,'')) AS nombre,
           tipo_identificacion || '-' || numero_identificacion AS identificacion,
           similarity(coalesce(nombres,'') || ' ' || coalesce(apellidos,'') || ' ' || coalesce(razon_social,''), ${nombre})::float8 AS similitud
    FROM cys.partes
    WHERE empresa = ${empresa} AND estado <> 'fusionada' AND id <> ${BigInt(excluir ?? 0)}
      AND (coalesce(nombres,'') || ' ' || coalesce(apellidos,'') || ' ' || coalesce(razon_social,'')) % ${nombre}
    ORDER BY similitud DESC LIMIT 5`;
  return filas.map((f) => ({ ...f, id: n(f.id) }));
}

// ---------------------------------------------------------------- titularidades
export async function titularidades(empresa: string, ficha: { vehiculo?: number; propiedad?: number; parte?: number }) {
  const filas = await db.titularidades.findMany({
    where: {
      empresa,
      ...(ficha.vehiculo ? { id_vehiculo: BigInt(ficha.vehiculo) } : {}),
      ...(ficha.propiedad ? { id_propiedad: BigInt(ficha.propiedad) } : {}),
      ...(ficha.parte ? { id_parte: BigInt(ficha.parte) } : {}),
    },
    orderBy: [{ hasta: { sort: "asc", nulls: "first" } }, { desde: "desc" }],
    include: {
      partes: { select: { tipo: true, nombres: true, apellidos: true, razon_social: true } },
      vehiculos: { select: { placa: true } },
      propiedades: { select: { nombre: true } },
    },
  });
  return filas.map((t) => ({
    id: n(t.id),
    rol: t.rol,
    id_parte: n(t.id_parte),
    parte: nombreParte(t.partes),
    id_vehiculo: t.id_vehiculo ? n(t.id_vehiculo) : null,
    id_propiedad: t.id_propiedad ? n(t.id_propiedad) : null,
    activo: t.vehiculos ? `Vehículo ${t.vehiculos.placa}` : (t.propiedades?.nombre ?? ""),
    desde: aFecha(t.desde)!,
    hasta: aFecha(t.hasta),
    observaciones: t.observaciones,
  }));
}

// ---------------------------------------------------------------- vehículos y propiedades
export type FiltroActivos = { empresas: string[]; q: string; estado: string; pagina: number };

export async function listarVehiculos(f: FiltroActivos) {
  const q = f.q.trim();
  const where: Prisma.vehiculosWhereInput = {
    empresa: { in: f.empresas },
    ...(f.estado ? { estado: f.estado } : {}),
    ...(q
      ? {
          OR: [
            { placa_normalizada: { contains: q.replace(/[^A-Za-z0-9]/g, "").toUpperCase() } },
            { modelos: { nombre: { contains: q, mode: "insensitive" } } },
            { modelos: { marcas: { nombre: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [total, filas] = await Promise.all([
    db.vehiculos.count({ where }),
    db.vehiculos.findMany({
      where,
      orderBy: [{ estado: "asc" }, { placa: "asc" }],
      skip: (f.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      include: { modelos: { select: { nombre: true, marcas: { select: { nombre: true } } } } },
    }),
  ]);
  return {
    total,
    filas: filas.map((v) => ({
      id: n(v.id),
      empresa: v.empresa,
      placa: v.placa,
      vehiculo: v.modelos ? `${v.modelos.marcas.nombre} ${v.modelos.nombre}` : "—",
      anio: v.anio,
      tipo: v.tipo_vehiculo,
      tm: v.tm?.toString() ?? null,
      origen: v.origen,
      estado: v.estado,
    })),
  };
}

export async function obtenerVehiculo(id: number) {
  const v = await db.vehiculos.findUnique({ where: { id: BigInt(id) }, include: { modelos: { select: { nombre: true, marcas: { select: { nombre: true } } } } } });
  if (!v) return null;
  return {
    ...v,
    id: n(v.id),
    marcaModelo: v.modelos ? `${v.modelos.marcas.nombre} ${v.modelos.nombre}` : null,
    tm: v.tm?.toString() ?? null,
    fecha_adquisicion: aFecha(v.fecha_adquisicion),
    fecha_baja: aFecha(v.fecha_baja),
  };
}

export async function listarPropiedades(f: FiltroActivos) {
  const q = f.q.trim();
  const where: Prisma.propiedadesWhereInput = {
    empresa: { in: f.empresas },
    ...(f.estado ? { estado: f.estado } : {}),
    ...(q ? { OR: [{ nombre: { contains: q, mode: "insensitive" } }, { direccion: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, filas] = await Promise.all([
    db.propiedades.count({ where }),
    db.propiedades.findMany({ where, orderBy: [{ estado: "asc" }, { nombre: "asc" }], skip: (f.pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
  ]);
  return {
    total,
    filas: filas.map((p) => ({
      id: n(p.id),
      empresa: p.empresa,
      nombre: p.nombre,
      tipo: p.tipo_inmueble,
      valor: p.valor_declarado ? `${p.moneda} ${Number(p.valor_declarado).toLocaleString("es-VE", { minimumFractionDigits: 2 })}` : "—",
      estado: p.estado,
    })),
  };
}

export async function obtenerPropiedad(id: number) {
  const p = await db.propiedades.findUnique({ where: { id: BigInt(id) } });
  if (!p) return null;
  return { ...p, id: n(p.id), valor_declarado: p.valor_declarado?.toString() ?? null, fecha_baja: aFecha(p.fecha_baja) };
}

// ---------------------------------------------------------------- documentos e historial
export type Ficha = { tipo: "parte" | "vehiculo" | "propiedad" | "poliza" | "siniestro"; id: number };

const columnaFicha = { parte: "id_parte", vehiculo: "id_vehiculo", propiedad: "id_propiedad", poliza: "id_poliza", siniestro: "id_siniestro" } as const;
export const ENTIDAD_FICHA = { parte: "partes", vehiculo: "vehiculos", propiedad: "propiedades", poliza: "polizas", siniestro: "siniestros" } as const;

export async function documentosDe(empresa: string, ficha: Ficha, verConfidenciales: boolean) {
  const filas = await db.documentos.findMany({
    where: { empresa, retirado: false, [columnaFicha[ficha.tipo]]: BigInt(ficha.id), ...(verConfidenciales ? {} : { confidencial: false }) },
    orderBy: { creado_en: "desc" },
    include: { archivos: { select: { id: true, nombre: true, tamano: true, es_imagen: true } }, app_usuarios: { select: { nombre_apellido: true } } },
  });
  return filas.map((d) => ({
    id: n(d.id),
    archivo: d.archivos.id,
    nombre: d.archivos.nombre,
    tamano: Number(d.archivos.tamano),
    esImagen: d.archivos.es_imagen,
    tipo: d.tipo_documento,
    descripcion: d.descripcion,
    fecha: aFecha(d.fecha_documento),
    confidencial: d.confidencial,
    subidoPor: d.app_usuarios.nombre_apellido,
    subidoEn: d.creado_en,
  }));
}

/** Historial de una ficha desde la bitácora (operaciones registradas con entidad e id). */
export async function historialDe(empresa: string, entidad: string, id: number) {
  const filas = await db.app_bitacora.findMany({
    where: { empresa, entidad, id_registro: String(id) },
    orderBy: { fecha_gestion: "desc" },
    take: 100,
  });
  const usuarios = await db.app_usuarios.findMany({
    where: { id_usuario: { in: [...new Set(filas.map((f) => f.id_usuario_gestion).filter((x): x is number => x !== null))] } },
    select: { id_usuario: true, nombre_apellido: true },
  });
  const nombre = new Map(usuarios.map((u) => [u.id_usuario, u.nombre_apellido]));
  return filas.map((f) => ({ id: String(f.id), fecha: f.fecha_gestion, usuario: f.id_usuario_gestion ? (nombre.get(f.id_usuario_gestion) ?? "—") : "Sistema", operacion: f.operacion, descripcion: f.descripcion, motivo: f.motivo }));
}
