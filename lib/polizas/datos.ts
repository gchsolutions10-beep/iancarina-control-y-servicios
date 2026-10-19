import "server-only";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { ajuste as obtenerAjuste } from "@/lib/ajustes";
import { tasaPromedio, totalPrimas } from "@/lib/dominio/calculo/motor";
import { elegibleParaRenovar } from "@/lib/dominio/elegibilidad";
import { diasEntre, estadoVigencia, type EstadoVigencia } from "@/lib/dominio/vigencias";
import { hoyPlanta } from "@/lib/tiempo";
import { nombreParte } from "@/lib/validations/fichas";

/**
 * Consultas de pólizas (Etapa 3). Toda lista recibe las empresas visibles del usuario; las fichas
 * devuelven su empresa para que la página verifique el permiso. Importes como texto decimal
 * (nunca float) y siempre con su moneda.
 */
const n = (v: bigint) => Number(v);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const txt = (v: { toString(): string } | null) => (v === null ? null : v.toString());
export const POR_PAGINA = 25;

const SELECT_PARTE = { select: { tipo: true, nombres: true, apellidos: true, razon_social: true } } as const;

export const ROLES_PERIODO = { tomador: "Tomador", contratante: "Contratante", pagador: "Pagador", corredor: "Corredor" } as const;
export const SUJETOS = { vehiculo: "Vehículo", persona: "Persona", propiedad: "Propiedad" } as const;

// ---------------------------------------------------------------- catálogos y opciones
export async function opcionesAseguradoras(empresa: string) {
  const filas = await db.partes.findMany({
    where: { empresa, tipo: "juridica", estado: "activa", funciones: { has: "Aseguradora" } },
    orderBy: { razon_social: "asc" },
    select: { id: true, razon_social: true },
  });
  return filas.map((p) => ({ valor: String(p.id), etiqueta: p.razon_social ?? "" }));
}

export async function ramos(soloActivos = true) {
  return db.ramos.findMany({
    where: soloActivos ? { activo: true } : {},
    orderBy: { nombre: "asc" },
    include: { coberturas: { orderBy: [{ orden: "asc" }, { nombre: "asc" }], ...(soloActivos ? { where: { activo: true } } : {}) } },
  });
}

/** Fichas que se pueden incluir como asegurados según el ramo (activas de la misma empresa). */
export async function opcionesSujetos(empresa: string, sujeto: string) {
  if (sujeto === "vehiculo") {
    const v = await db.vehiculos.findMany({
      where: { empresa, estado: "activo" },
      orderBy: { placa: "asc" },
      select: { id: true, placa: true, tipo_vehiculo: true, modelos: { select: { nombre: true, marcas: { select: { nombre: true } } } } },
    });
    return v.map((x) => ({ valor: String(x.id), etiqueta: `${x.placa}${x.modelos ? ` · ${x.modelos.marcas.nombre} ${x.modelos.nombre}` : ""}`, clase: x.tipo_vehiculo }));
  }
  if (sujeto === "propiedad") {
    const p = await db.propiedades.findMany({ where: { empresa, estado: "activa" }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } });
    return p.map((x) => ({ valor: String(x.id), etiqueta: x.nombre, clase: null }));
  }
  const p = await db.partes.findMany({
    where: { empresa, tipo: "natural", estado: "activa" },
    orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
    select: { id: true, tipo: true, nombres: true, apellidos: true, razon_social: true, tipo_identificacion: true, numero_identificacion: true },
  });
  return p.map((x) => ({ valor: String(x.id), etiqueta: `${nombreParte(x)} · ${x.tipo_identificacion}-${x.numero_identificacion}`, clase: null }));
}

// ---------------------------------------------------------------- listado de pólizas
export type FiltroPolizas = { empresas: string[]; q: string; estado: string; ramo: string; pagina: number };

export const ESTADOS_VIGENCIA: Record<EstadoVigencia | "sin_periodo", string> = {
  borrador: "En preparación",
  futuro: "Por iniciar",
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencida",
  anulado: "Anulada",
  sin_periodo: "Sin vigencia",
};

/** Pólizas con su vigencia más reciente, conteo para las tarjetas de control y página pedida. */
export async function listarPolizas(f: FiltroPolizas) {
  const q = f.q.trim();
  const dias = await obtenerAjuste("polizas.dias_por_vencer");
  const hoy = hoyPlanta();
  const polizas = await db.polizas.findMany({
    where: {
      empresa: { in: f.empresas },
      ...(f.ramo ? { id_ramo: Number(f.ramo) || 0 } : {}),
      ...(q
        ? { OR: [{ numero: { contains: q, mode: "insensitive" } }, { descripcion: { contains: q, mode: "insensitive" } }, { partes: { razon_social: { contains: q, mode: "insensitive" } } }] }
        : {}),
    },
    orderBy: [{ numero: "asc" }],
    include: {
      partes: { select: { razon_social: true } },
      ramos: { select: { nombre: true } },
      poliza_periodos: { where: { estado: { not: "anulado" } }, orderBy: { numero_periodo: "desc" }, take: 2 },
    },
  });
  const filas = polizas.map((p) => {
    // La vigencia que manda es la confirmada más reciente; si solo hay borrador, ese.
    const confirmado = p.poliza_periodos.find((x) => x.estado === "confirmado");
    const actual = confirmado ?? p.poliza_periodos[0];
    const enRenovacion = !!confirmado && p.poliza_periodos[0]?.estado === "borrador";
    const estado = actual ? estadoVigencia({ estado: actual.estado, desde: iso(actual.vigencia_desde), hasta: iso(actual.vigencia_hasta) }, hoy, dias) : "sin_periodo";
    return {
      id: n(p.id),
      empresa: p.empresa,
      numero: p.numero,
      aseguradora: p.partes.razon_social ?? "",
      ramo: p.ramos.nombre,
      desde: actual ? iso(actual.vigencia_desde) : null,
      hasta: actual ? iso(actual.vigencia_hasta) : null,
      estado: p.estado === "cancelada" ? ("anulado" as const) : estado,
      enRenovacion,
    };
  });
  const conteo = filas.reduce<Record<string, number>>((c, x) => ((c[x.estado] = (c[x.estado] ?? 0) + 1), c), {});
  const filtradas = f.estado ? filas.filter((x) => x.estado === f.estado) : filas;
  return { total: filtradas.length, conteo, filas: filtradas.slice((f.pagina - 1) * POR_PAGINA, f.pagina * POR_PAGINA) };
}

// ---------------------------------------------------------------- ficha de póliza
export async function obtenerPoliza(id: number) {
  const p = await db.polizas.findUnique({
    where: { id: BigInt(id) },
    include: {
      partes: { select: { id: true, razon_social: true } },
      ramos: true,
      poliza_periodos: { orderBy: { numero_periodo: "desc" } },
    },
  });
  if (!p) return null;
  const dias = await obtenerAjuste("polizas.dias_por_vencer");
  const hoy = hoyPlanta();
  const totales = await Promise.all(p.poliza_periodos.map((x) => resumenPeriodo(x.id)));
  return {
    id: n(p.id),
    empresa: p.empresa,
    numero: p.numero,
    descripcion: p.descripcion,
    estado: p.estado,
    id_aseguradora: n(p.partes.id),
    aseguradora: p.partes.razon_social ?? "",
    ramo: p.ramos.nombre,
    sujeto: p.ramos.sujeto,
    periodos: p.poliza_periodos.map((x, i) => ({
      id: n(x.id),
      numero: x.numero_periodo,
      desde: iso(x.vigencia_desde),
      hasta: iso(x.vigencia_hasta),
      moneda: x.moneda,
      estado: x.estado,
      vigencia: estadoVigencia({ estado: x.estado, desde: iso(x.vigencia_desde), hasta: iso(x.vigencia_hasta) }, hoy, dias),
      ...totales[i],
    })),
  };
}

/** Totales de un período: asegurados vigentes, suma asegurada, prima inicial, endosos y total. */
export async function resumenPeriodo(idPeriodo: bigint) {
  const [periodo, inclusiones, endosos] = await Promise.all([
    db.poliza_periodos.findUniqueOrThrow({ where: { id: idPeriodo }, select: { vigencia_hasta: true } }),
    db.inclusiones.findMany({
      where: { id_periodo: idPeriodo },
      select: { hasta: true, suma_asegurada: true, inclusion_coberturas: { select: { prima_periodo: true, id_endoso: true, coberturas: { select: { nombre: true, incluida_en_padre: true } } } } },
    }),
    db.endosos.findMany({ where: { id_periodo: idPeriodo, estado: "confirmado", prima: { not: null } }, select: { prima: true } }),
  ]);
  const fin = periodo.vigencia_hasta.getTime();
  const vigentes = inclusiones.filter((i) => i.hasta.getTime() === fin);
  const lineasIniciales = inclusiones.flatMap((i) =>
    i.inclusion_coberturas.filter((c) => c.id_endoso === null).map((c) => ({ cobertura: c.coberturas.nombre, incluidaEnPadre: c.coberturas.incluida_en_padre, prima: txt(c.prima_periodo) })),
  );
  const primaInicial = totalPrimas(lineasIniciales);
  const primaEndosos = endosos.reduce((s, e) => s.plus(e.prima!.toString()), new Decimal(0));
  const suma = vigentes.reduce((s, i) => s.plus(i.suma_asegurada?.toString() ?? 0), new Decimal(0));
  return {
    asegurados: vigentes.length,
    sumaAsegurada: suma.toFixed(2),
    primaInicial: primaInicial.toFixed(2),
    primaEndosos: primaEndosos.toFixed(2),
    primaTotal: primaInicial.plus(primaEndosos).toFixed(2),
    sinCalcular: lineasIniciales.filter((l) => l.prima === null).length,
  };
}

// ---------------------------------------------------------------- período (pantalla principal)
export async function obtenerPeriodo(id: number) {
  const p = await db.poliza_periodos.findUnique({
    where: { id: BigInt(id) },
    include: {
      polizas: { include: { partes: { select: { id: true, razon_social: true } }, ramos: { include: { coberturas: { orderBy: [{ orden: "asc" }, { nombre: "asc" }] } } } } },
      poliza_periodos: { select: { id: true, numero_periodo: true, vigencia_desde: true, vigencia_hasta: true } },
      other_poliza_periodos: { where: { estado: { not: "anulado" } }, select: { id: true, numero_periodo: true, estado: true } },
      app_usuarios_poliza_periodos_confirmado_porToapp_usuarios: { select: { nombre_apellido: true } },
    },
  });
  if (!p) return null;
  const dias = await obtenerAjuste("polizas.dias_por_vencer");
  const desde = iso(p.vigencia_desde);
  const hasta = iso(p.vigencia_hasta);
  return {
    id: n(p.id),
    empresa: p.empresa,
    id_poliza: n(p.id_poliza),
    numero_poliza: p.polizas.numero,
    id_aseguradora: n(p.polizas.partes.id),
    aseguradora: p.polizas.partes.razon_social ?? "",
    id_ramo: p.polizas.id_ramo,
    ramo: p.polizas.ramos.nombre,
    sujeto: p.polizas.ramos.sujeto as keyof typeof SUJETOS,
    coberturas: p.polizas.ramos.coberturas.map((c) => ({ id: c.id, nombre: c.nombre, activo: c.activo, incluida_en_padre: c.incluida_en_padre })),
    numero: p.numero_periodo,
    desde,
    hasta,
    diasPeriodo: diasEntre(desde, hasta),
    moneda: p.moneda,
    estado: p.estado as "borrador" | "confirmado" | "anulado",
    vigencia: estadoVigencia({ estado: p.estado, desde, hasta }, hoyPlanta(), dias),
    confirmado_por: p.app_usuarios_poliza_periodos_confirmado_porToapp_usuarios?.nombre_apellido ?? null,
    confirmado_en: p.confirmado_en,
    observaciones: p.observaciones,
    anterior: p.poliza_periodos ? { id: n(p.poliza_periodos.id), numero: p.poliza_periodos.numero_periodo, desde: iso(p.poliza_periodos.vigencia_desde), hasta: iso(p.poliza_periodos.vigencia_hasta) } : null,
    siguiente: p.other_poliza_periodos[0] ? { id: n(p.other_poliza_periodos[0].id), numero: p.other_poliza_periodos[0].numero_periodo, estado: p.other_poliza_periodos[0].estado } : null,
  };
}

export async function partesPeriodo(idPeriodo: number) {
  const filas = await db.periodo_partes.findMany({
    where: { id_periodo: BigInt(idPeriodo) },
    orderBy: [{ rol: "asc" }, { desde: "asc" }],
    include: { partes: SELECT_PARTE, endosos: { select: { numero: true } } },
  });
  return filas.map((r) => ({
    id: n(r.id),
    rol: r.rol as keyof typeof ROLES_PERIODO,
    id_parte: n(r.id_parte),
    parte: nombreParte(r.partes),
    desde: iso(r.desde),
    hasta: r.hasta ? iso(r.hasta) : null,
    endoso: r.endosos?.numero ?? null,
  }));
}

export async function tarifasPeriodo(idPeriodo: number) {
  const filas = await db.periodo_tarifas.findMany({
    where: { id_periodo: BigInt(idPeriodo) },
    orderBy: [{ coberturas: { orden: "asc" } }, { clase: { sort: "asc", nulls: "first" } }],
    include: { coberturas: { select: { nombre: true } } },
  });
  return filas.map((t) => ({ id: n(t.id), id_cobertura: t.id_cobertura, cobertura: t.coberturas.nombre, clase: t.clase, tasa: txt(t.tasa), prima_fija: txt(t.prima_fija) }));
}

export type Asegurado = Awaited<ReturnType<typeof aseguradosPeriodo>>[number];

export async function aseguradosPeriodo(idPeriodo: number) {
  const filas = await db.inclusiones.findMany({
    where: { id_periodo: BigInt(idPeriodo) },
    orderBy: [{ desde: "asc" }, { id: "asc" }],
    include: {
      partes: SELECT_PARTE,
      vehiculos: { select: { placa: true, estado: true, fecha_baja: true, modelos: { select: { nombre: true, marcas: { select: { nombre: true } } } } } },
      propiedades: { select: { nombre: true, estado: true } },
      calculos: { select: { faltantes: true } },
      endosos_inclusiones_empresa_id_endoso_altaToendosos: { select: { numero: true } },
      endosos_inclusiones_empresa_id_endoso_bajaToendosos: { select: { numero: true, fecha_efectiva: true } },
      inclusion_coberturas: {
        orderBy: { coberturas: { orden: "asc" } },
        include: { coberturas: { select: { nombre: true, incluida_en_padre: true } }, calculos: { select: { faltantes: true, expresion: true, reglas_calculo: { select: { nombre: true, estado: true, version: true } } } } },
      },
      beneficiarios: { orderBy: { desde: "asc" }, include: { partes: SELECT_PARTE } },
    },
  });
  return filas.map((i) => ({
    id: n(i.id),
    tipo: i.id_vehiculo ? ("vehiculo" as const) : i.id_propiedad ? ("propiedad" as const) : ("persona" as const),
    id_sujeto: n(i.id_vehiculo ?? i.id_propiedad ?? i.id_persona!),
    sujeto: i.vehiculos ? `${i.vehiculos.placa}${i.vehiculos.modelos ? ` · ${i.vehiculos.modelos.marcas.nombre} ${i.vehiculos.modelos.nombre}` : ""}` : i.propiedades ? i.propiedades.nombre : nombreParte(i.partes!),
    certificado: i.certificado,
    ceco: i.ceco,
    clase_tarifa: i.clase_tarifa,
    desde: iso(i.desde),
    hasta: iso(i.hasta),
    valor_bien: txt(i.valor_bien),
    aditamentos: txt(i.aditamentos),
    suma_asegurada: txt(i.suma_asegurada),
    faltantesSuma: (i.calculos?.faltantes as string[] | undefined) ?? [],
    endosoAlta: i.endosos_inclusiones_empresa_id_endoso_altaToendosos?.numero ?? null,
    baja: i.endosos_inclusiones_empresa_id_endoso_bajaToendosos ? { numero: i.endosos_inclusiones_empresa_id_endoso_bajaToendosos.numero, fecha: iso(i.endosos_inclusiones_empresa_id_endoso_bajaToendosos.fecha_efectiva) } : null,
    observaciones: i.observaciones,
    coberturas: i.inclusion_coberturas.map((c) => ({
      id: n(c.id),
      id_cobertura: c.id_cobertura,
      nombre: c.coberturas.nombre,
      incluida_en_padre: c.coberturas.incluida_en_padre,
      prima_anual: txt(c.prima_anual),
      prima_periodo: txt(c.prima_periodo),
      origen: c.origen,
      prima_calculada: txt(c.prima_calculada),
      motivo_ajuste: c.motivo_ajuste,
      regla: c.calculos?.reglas_calculo ? `${c.calculos.reglas_calculo.nombre} v${c.calculos.reglas_calculo.version}${c.calculos.reglas_calculo.estado === "propuesta" ? " (Propuesta)" : ""}` : null,
      expresion: c.calculos?.expresion ?? null,
      faltantes: (c.calculos?.faltantes as string[] | undefined) ?? [],
      porEndoso: c.id_endoso !== null,
    })),
    beneficiarios: i.beneficiarios.map((b) => ({ id: n(b.id), id_parte: n(b.id_parte), parte: nombreParte(b.partes), parentesco: b.parentesco, porcentaje: b.porcentaje.toString(), desde: iso(b.desde), hasta: b.hasta ? iso(b.hasta) : null })),
  }));
}

export async function endososPeriodo(idPeriodo: number) {
  const filas = await db.endosos.findMany({
    where: { id_periodo: BigInt(idPeriodo) },
    orderBy: { numero: "asc" },
    include: { app_usuarios: { select: { nombre_apellido: true } } },
  });
  return filas.map((e) => ({
    id: n(e.id),
    numero: e.numero,
    tipo: e.tipo,
    fecha: iso(e.fecha_efectiva),
    numero_aseguradora: e.numero_aseguradora,
    prima: txt(e.prima),
    retroactivo: e.retroactivo,
    descripcion: e.descripcion,
    motivo: e.motivo,
    usuario: e.app_usuarios.nombre_apellido,
  }));
}

// ---------------------------------------------------------------- comparación interanual
type FilaComparacion = { clave: string; anterior: string; actual: string };

/**
 * Comparación de dos períodos (misma moneda): prima neta por cobertura y por CECO (inicial + altas −
 * devoluciones por bajas, según el detalle calculado de cada endoso) y asegurados vigentes al cierre.
 */
export async function compararPeriodos(actual: number, anterior: number) {
  const linea = async (id: number) => {
    const [periodo, inc, devoluciones] = await Promise.all([
      db.poliza_periodos.findUniqueOrThrow({ where: { id: BigInt(id) }, select: { vigencia_hasta: true } }),
      db.inclusiones.findMany({
        where: { id_periodo: BigInt(id) },
        select: { ceco: true, hasta: true, suma_asegurada: true, inclusion_coberturas: { select: { prima_periodo: true, coberturas: { select: { nombre: true, incluida_en_padre: true } } } } },
      }),
      db.endoso_lineas.findMany({
        where: { endosos: { id_periodo: BigInt(id), tipo: "baja", estado: "confirmado" } },
        select: { importe: true, inclusion_coberturas: { select: { coberturas: { select: { nombre: true, incluida_en_padre: true } }, inclusiones: { select: { ceco: true } } } } },
      }),
    ]);
    const porCobertura = new Map<string, Decimal>();
    const porCeco = new Map<string, Decimal>();
    const sumar = (cobertura: string, ceco: string | null, v: Decimal) => {
      porCobertura.set(cobertura, (porCobertura.get(cobertura) ?? new Decimal(0)).plus(v));
      const c = ceco || "Sin CECO";
      porCeco.set(c, (porCeco.get(c) ?? new Decimal(0)).plus(v));
    };
    for (const i of inc) {
      for (const c of i.inclusion_coberturas) {
        if (!c.coberturas.incluida_en_padre && c.prima_periodo !== null) sumar(c.coberturas.nombre, i.ceco, new Decimal(c.prima_periodo.toString()));
      }
    }
    for (const d of devoluciones) {
      const ic = d.inclusion_coberturas;
      if (!ic.coberturas.incluida_en_padre) sumar(ic.coberturas.nombre, ic.inclusiones.ceco, new Decimal(d.importe.toString()));
    }
    const fin = periodo.vigencia_hasta.getTime();
    const vigentes = inc.filter((i) => i.hasta.getTime() === fin);
    const suma = vigentes.reduce((s, i) => s.plus(i.suma_asegurada?.toString() ?? 0), new Decimal(0));
    const total = [...porCobertura.values()].reduce((s, v) => s.plus(v), new Decimal(0));
    return { asegurados: vigentes.length, suma, total, porCobertura, porCeco };
  };
  const [a, b] = await Promise.all([linea(anterior), linea(actual)]);
  const unir = (x: Map<string, Decimal>, y: Map<string, Decimal>): FilaComparacion[] =>
    [...new Set([...x.keys(), ...y.keys()])].map((clave) => ({ clave, anterior: (x.get(clave) ?? new Decimal(0)).toFixed(2), actual: (y.get(clave) ?? new Decimal(0)).toFixed(2) }));
  return {
    indicadores: [
      { clave: "Asegurados al cierre", anterior: String(a.asegurados), actual: String(b.asegurados) },
      { clave: "Suma asegurada", anterior: a.suma.toFixed(2), actual: b.suma.toFixed(2) },
      { clave: "Prima neta", anterior: a.total.toFixed(2), actual: b.total.toFixed(2) },
      { clave: "Tasa promedio ponderada (%)", anterior: tasaPromedio(a.total, a.suma)?.toFixed(4) ?? "—", actual: tasaPromedio(b.total, b.suma)?.toFixed(4) ?? "—" },
    ],
    porCobertura: unir(a.porCobertura, b.porCobertura),
    porCeco: unir(a.porCeco, b.porCeco),
  };
}

/** Asegurados del período anterior que no pasaron a la renovación, con su motivo. */
export async function excluidosRenovacion(idNuevo: number, idAnterior: number) {
  const [nuevo, anterior, copiadas] = await Promise.all([
    db.poliza_periodos.findUniqueOrThrow({ where: { id: BigInt(idNuevo) }, select: { vigencia_desde: true } }),
    db.poliza_periodos.findUniqueOrThrow({ where: { id: BigInt(idAnterior) }, select: { vigencia_hasta: true } }),
    db.inclusiones.findMany({ where: { id_periodo: BigInt(idNuevo), id_inclusion_anterior: { not: null } }, select: { id_inclusion_anterior: true } }),
  ]);
  const yaCopiadas = new Set(copiadas.map((c) => c.id_inclusion_anterior!.toString()));
  const previas = await db.inclusiones.findMany({
    where: { id_periodo: BigInt(idAnterior) },
    include: {
      partes: { select: { tipo: true, nombres: true, apellidos: true, razon_social: true, estado: true } },
      vehiculos: { select: { placa: true, estado: true, fecha_baja: true, motivo_baja: true } },
      propiedades: { select: { nombre: true, estado: true, fecha_baja: true, motivo_baja: true } },
    },
  });
  return previas
    .filter((i) => !yaCopiadas.has(i.id.toString()))
    .map((i) => {
      const s = i.vehiculos ?? i.propiedades;
      const sujeto = {
        tipo: i.vehiculos ? ("vehiculo" as const) : i.propiedades ? ("propiedad" as const) : ("persona" as const),
        nombre: i.vehiculos?.placa ?? i.propiedades?.nombre ?? nombreParte(i.partes!),
        estado: s?.estado ?? i.partes!.estado,
        fecha_baja: s?.fecha_baja ? iso(s.fecha_baja) : null,
        motivo_baja: s?.motivo_baja ?? null,
      };
      const r = elegibleParaRenovar({ hasta: iso(i.hasta), baja_por_endoso: i.id_endoso_baja !== null }, iso(anterior.vigencia_hasta), sujeto, iso(nuevo.vigencia_desde));
      return { id: n(i.id), sujeto: sujeto.nombre, motivo: r.elegible ? "Quitado al preparar la renovación" : r.motivo };
    });
}

// ---------------------------------------------------------------- renovaciones
/** Vigencias confirmadas que terminan dentro del plazo (o ya terminaron) y no tienen renovación. */
export async function porRenovar(empresas: string[]) {
  const dias = await obtenerAjuste("renovaciones.dias_anticipacion");
  const hoy = hoyPlanta();
  const limite = new Date(`${hoy}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + dias);
  const [pendientes, enCurso] = await Promise.all([
    db.poliza_periodos.findMany({
      where: { empresa: { in: empresas }, estado: "confirmado", vigencia_hasta: { lte: limite }, polizas: { estado: "activa" }, other_poliza_periodos: { none: { estado: { not: "anulado" } } } },
      orderBy: { vigencia_hasta: "asc" },
      include: { polizas: { include: { partes: { select: { razon_social: true } }, ramos: { select: { nombre: true } } } } },
    }),
    db.poliza_periodos.findMany({
      where: { empresa: { in: empresas }, estado: "borrador", id_periodo_anterior: { not: null } },
      orderBy: { vigencia_desde: "asc" },
      include: { polizas: { include: { partes: { select: { razon_social: true } }, ramos: { select: { nombre: true } } } } },
    }),
  ]);
  const fila = (p: (typeof pendientes)[number]) => ({
    id: n(p.id),
    id_poliza: n(p.id_poliza),
    empresa: p.empresa,
    numero: p.polizas.numero,
    aseguradora: p.polizas.partes.razon_social ?? "",
    ramo: p.polizas.ramos.nombre,
    desde: iso(p.vigencia_desde),
    hasta: iso(p.vigencia_hasta),
    diasRestantes: diasEntre(hoy, iso(p.vigencia_hasta)),
  });
  return { dias, pendientes: pendientes.map(fila), enCurso: enCurso.map(fila) };
}

// ---------------------------------------------------------------- pólizas de una ficha
export async function polizasDe(empresa: string, ficha: { persona?: number; vehiculo?: number; propiedad?: number }) {
  const filas = await db.inclusiones.findMany({
    where: {
      empresa,
      poliza_periodos: { estado: { not: "anulado" } },
      ...(ficha.persona ? { id_persona: BigInt(ficha.persona) } : {}),
      ...(ficha.vehiculo ? { id_vehiculo: BigInt(ficha.vehiculo) } : {}),
      ...(ficha.propiedad ? { id_propiedad: BigInt(ficha.propiedad) } : {}),
    },
    orderBy: { desde: "desc" },
    include: { poliza_periodos: { include: { polizas: { include: { partes: { select: { razon_social: true } }, ramos: { select: { nombre: true } } } } } } },
  });
  return filas.map((i) => ({
    id_periodo: n(i.id_periodo),
    poliza: i.poliza_periodos.polizas.numero,
    aseguradora: i.poliza_periodos.polizas.partes.razon_social ?? "",
    ramo: i.poliza_periodos.polizas.ramos.nombre,
    desde: iso(i.desde),
    hasta: iso(i.hasta),
    estadoPeriodo: i.poliza_periodos.estado,
    baja: i.id_endoso_baja !== null,
  }));
}

/** Reglas de cálculo para la pantalla de Configuración. */
export async function reglasCalculo() {
  const filas = await db.reglas_calculo.findMany({
    orderBy: [{ tipo: "asc" }, { nombre: "asc" }, { version: "desc" }],
    include: { ramos: { select: { nombre: true } }, coberturas: { select: { nombre: true } }, partes: { select: { razon_social: true } }, polizas: { select: { numero: true } }, _count: { select: { calculos: true, endoso_lineas: true } } },
  });
  return filas.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo,
    estado: r.estado,
    version: r.version,
    ambito: [r.empresa && `Empresa ${r.empresa}`, r.partes?.razon_social, r.polizas && `Póliza ${r.polizas.numero}`, r.ramos?.nombre, r.coberturas?.nombre].filter(Boolean).join(" · ") || "General",
    id_ramo: r.id_ramo,
    id_cobertura: r.id_cobertura,
    expresion: r.expresion,
    evento: r.evento,
    metodo: r.metodo,
    base_dias: r.base_dias,
    decimales: r.decimales,
    vigente_desde: iso(r.vigente_desde),
    vigente_hasta: r.vigente_hasta ? iso(r.vigente_hasta) : null,
    descripcion: r.descripcion,
    id_regla_anterior: r.id_regla_anterior,
    /** Cálculos de prima y líneas de endoso (prorrateo) hechos con esta versión. */
    usos: r._count.calculos + r._count.endoso_lineas,
  }));
}
