"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describirCambios, registrarGestion } from "@/lib/auditoria";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { documentosFaltantes } from "@/lib/dominio/siniestros";
import type { EstadoAccion } from "@/lib/estado-accion";
import { codigoPg, sinPermiso } from "@/lib/fichas/acceso";
import { afectadoValido, coberturaValida, siniestroEditable } from "@/lib/siniestros/edicion";
import { avanzarEtapaTx, BloqueoSiniestro, crearSiniestroTx, generarCobroTx, MODULO, registrarImporteTx, type NuevoSiniestro } from "@/lib/siniestros/operaciones";
import { hoyPlanta } from "@/lib/tiempo";
import { erroresDeZod } from "@/lib/validations/comunes";
import { actuacionSchema, afectadoSchema, cierreSchema, cobroSchema, datosSiniestroSchema, etapaSchema, importeSchema, limiteSchema, siniestroSchema, transporteSchema } from "@/lib/validations/siniestros";

/**
 * Siniestros. Toda escritura: sesión → permiso en la empresa (y datos personales si es confidencial)
 * → Zod → transacción con bitácora en el historial del expediente.
 */
const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "");
const fecha = (v: string) => new Date(`${v}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ruta = (id: bigint | number) => `/siniestros/${id}`;
/** Vuelve al expediente con el aviso arriba (el formulario que envió puede desaparecer). */
const volver = (id: bigint, mensaje: string): never => {
  revalidatePath(ruta(id));
  redirect(`${ruta(id)}?hecho=${encodeURIComponent(mensaje)}`);
};
const bitacora = (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], usuario: number, empresa: string, id: bigint, descripcion: string, operacion: string, motivo?: string | null) =>
  registrarGestion(usuario, MODULO, descripcion, tx, { empresa, entidad: "siniestros", idRegistro: id, operacion, motivo });

function errorDe(error: unknown, contexto: string): EstadoAccion {
  if (error instanceof BloqueoSiniestro) return { error: error.message };
  console.error(`[${contexto}]`, error);
  return { error: "No se pudo guardar. Intenta de nuevo." };
}

// ---------------------------------------------------------------- expediente nuevo
export async function crearSiniestro(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const empresa = texto(fd, "empresa");
  const negado = sinPermiso(usuario, empresa, "seguros.registrar");
  if (negado) return { error: negado };
  const entrada = siniestroSchema.safeParse({
    id_tipo: texto(fd, "id_tipo"), fecha_evento: texto(fd, "fecha_evento"), fecha_notificacion: texto(fd, "fecha_notificacion"), lugar: texto(fd, "lugar"),
    descripcion: texto(fd, "descripcion"), tipo_perdida: texto(fd, "tipo_perdida"), moneda: texto(fd, "moneda"), numero_aseguradora: texto(fd, "numero_aseguradora"),
  });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  if (d.fecha_evento > hoyPlanta()) return { errores: { fecha_evento: "No puede ser futura" } };
  const tipo = await db.tipos_siniestro.findUnique({ where: { id: d.id_tipo } });
  if (!tipo?.activo) return { errores: { id_tipo: "Tipo no válido" } };
  if (tipo.sujeto === "persona" && !tienePermiso(usuario, "personas.datos_sensibles", empresa)) return { error: "Los siniestros de personas son confidenciales: hace falta el permiso «Ver datos personales»." };

  let afectado: NuevoSiniestro["afectado"];
  let transporte: NuevoSiniestro["transporte"];
  if (tipo.sujeto === "transporte") {
    const t = transporteSchema.safeParse({
      id_transportista: texto(fd, "id_transportista"), id_vehiculo: texto(fd, "id_vehiculo"), placa_texto: texto(fd, "placa_texto"), mercancia: texto(fd, "mercancia"),
      guia: texto(fd, "guia"), valor_mercancia: texto(fd, "valor_mercancia"), perdida: texto(fd, "perdida"),
    });
    if (!t.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(t.error) };
    const tr = await db.partes.findUnique({ where: { id: t.data.id_transportista }, select: { empresa: true, funciones: true, estado: true } });
    if (!tr || tr.empresa !== empresa || tr.estado !== "activa") return { errores: { id_transportista: "Elige un transportista de esta empresa" } };
    if (t.data.id_vehiculo) {
      const v = await db.vehiculos.findUnique({ where: { id: t.data.id_vehiculo }, select: { empresa: true } });
      if (v?.empresa !== empresa) return { errores: { id_vehiculo: "Vehículo no válido" } };
    } else if (!t.data.placa_texto) return { errores: { placa_texto: "Indica la placa del transportista o elige un vehículo propio" } };
    transporte = t.data;
  } else {
    const a = afectadoSchema.safeParse({ id_sujeto: texto(fd, "id_sujeto"), cobertura: "", danos: texto(fd, "danos") });
    if (!a.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(a.error) };
    const ficha = await afectadoValido(tipo.sujeto, a.data.id_sujeto, empresa);
    if (!ficha) return { errores: { id_sujeto: "Elige una ficha de esta empresa" } };
    afectado = { ...ficha, danos: a.data.danos, cobertura: null };
  }

  let id: bigint;
  try {
    id = (await db.$transaction((tx) => crearSiniestroTx(tx, usuario.id, { empresa, ...d, afectado, transporte }), { timeout: 30_000 })).id;
  } catch (error) {
    return errorDe(error, "crearSiniestro");
  }
  revalidatePath("/siniestros/lista");
  redirect(`${ruta(id)}?creado=1`);
}

export async function guardarDatosSiniestro(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await siniestroEditable(usuario, texto(fd, "id"));
  if ("error" in r) return { error: r.error };
  const s = r.siniestro;
  const entrada = datosSiniestroSchema.safeParse({ numero_aseguradora: texto(fd, "numero_aseguradora"), lugar: texto(fd, "lugar"), descripcion: texto(fd, "descripcion"), tipo_perdida: texto(fd, "tipo_perdida"), fecha_notificacion: texto(fd, "fecha_notificacion") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  if (d.fecha_notificacion && d.fecha_notificacion < iso(s.fecha_evento)) return { errores: { fecha_notificacion: "No puede ser anterior al evento" } };
  await db.$transaction(async (tx) => {
    const nuevo = await tx.siniestros.update({
      where: { id: s.id },
      data: { numero_aseguradora: d.numero_aseguradora, lugar: d.lugar, descripcion: d.descripcion, tipo_perdida: d.tipo_perdida, ...(d.fecha_notificacion ? { fecha_notificacion: fecha(d.fecha_notificacion) } : {}), actualizado_por: usuario.id, actualizado_en: new Date() },
    });
    const vista = (x: typeof s) => ({ numero_aseguradora: x.numero_aseguradora, lugar: x.lugar, descripcion: x.descripcion, tipo_perdida: x.tipo_perdida, fecha_notificacion: iso(x.fecha_notificacion) });
    const cambios = describirCambios(Number(s.id), vista(s), vista({ ...s, ...nuevo }));
    if (cambios) await bitacora(tx, usuario.id, s.empresa, s.id, `${s.numero_expediente} | ${cambios}`, "MODIFICAR");
  });
  revalidatePath(ruta(s.id));
  return { ok: true, mensaje: "Cambios guardados." };
}

// ---------------------------------------------------------------- afectados y póliza
export async function agregarAfectado(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await siniestroEditable(usuario, texto(fd, "id_siniestro"), { abierto: true });
  if ("error" in r) return { error: r.error };
  const s = r.siniestro;
  if (s.tipos_siniestro.sujeto === "transporte") return { error: "En transporte contratado el afectado es la mercancía." };
  const a = afectadoSchema.safeParse({ id_sujeto: texto(fd, "id_sujeto"), cobertura: texto(fd, "cobertura"), danos: texto(fd, "danos") });
  if (!a.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(a.error) };
  const ficha = await afectadoValido(s.tipos_siniestro.sujeto, a.data.id_sujeto, s.empresa);
  if (!ficha) return { errores: { id_sujeto: "Elige una ficha de esta empresa" } };
  const cobertura = a.data.cobertura ? await coberturaValida(a.data.cobertura, ficha, iso(s.fecha_evento), s.empresa) : null;
  if (a.data.cobertura && !cobertura) return { errores: { cobertura: "Esa póliza no cubría a este afectado en la fecha del evento" } };
  if (cobertura && s.id_periodo && s.id_periodo !== cobertura.id_periodo) return { errores: { cobertura: "El expediente ya está vinculado a otra póliza" } };
  await db.$transaction(async (tx) => {
    await tx.siniestro_afectados.create({ data: { empresa: s.empresa, id_siniestro: s.id, [ficha.columna]: ficha.id, id_inclusion: cobertura?.id_inclusion ?? null, id_cobertura: cobertura?.id_cobertura ?? null, danos: a.data.danos, creado_por: usuario.id } });
    if (cobertura && !s.id_periodo) await tx.siniestros.update({ where: { id: s.id }, data: { id_periodo: cobertura.id_periodo } });
    await bitacora(tx, usuario.id, s.empresa, s.id, `${s.numero_expediente} | AFECTADO: ${ficha.nombre}${cobertura ? " (con póliza)" : ""}`, "AFECTADO");
  });
  revalidatePath(ruta(s.id));
  return { ok: true, mensaje: "Afectado agregado." };
}

/** Vincula explícitamente un afectado con la póliza y cobertura que responde (R15: nunca automático). */
export async function vincularCobertura(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await siniestroEditable(usuario, texto(fd, "id_siniestro"), { abierto: true });
  if ("error" in r) return { error: r.error };
  const s = r.siniestro;
  const af = await db.siniestro_afectados.findUnique({ where: { id: BigInt(Number(texto(fd, "id_afectado")) || 0) } });
  if (!af || af.id_siniestro !== s.id) return { error: "El afectado ya no está en el expediente." };
  const c = afectadoSchema.shape.cobertura.safeParse(texto(fd, "cobertura"));
  if (!c.success || !c.data) return { errores: { cobertura: "Elige la póliza y cobertura" } };
  const columna = af.id_vehiculo ? "id_vehiculo" : af.id_propiedad ? "id_propiedad" : "id_persona";
  const cobertura = await coberturaValida(c.data, { columna, id: (af.id_vehiculo ?? af.id_propiedad ?? af.id_persona)! }, iso(s.fecha_evento), s.empresa);
  if (!cobertura) return { errores: { cobertura: "Esa póliza no cubría a este afectado en la fecha del evento" } };
  if (s.id_periodo && s.id_periodo !== cobertura.id_periodo) return { errores: { cobertura: "El expediente ya está vinculado a otra póliza" } };
  await db.$transaction(async (tx) => {
    await tx.siniestro_afectados.update({ where: { id: af.id }, data: { id_inclusion: cobertura.id_inclusion, id_cobertura: cobertura.id_cobertura } });
    await tx.siniestros.update({ where: { id: s.id }, data: { id_periodo: cobertura.id_periodo } });
    await bitacora(tx, usuario.id, s.empresa, s.id, `${s.numero_expediente} | PÓLIZA VINCULADA al afectado ${af.id} (período ${cobertura.id_periodo}, cobertura ${cobertura.id_cobertura})`, "POLIZA");
  });
  return volver(s.id, "Póliza vinculada al afectado.");
}

// ---------------------------------------------------------------- etapas, actuaciones, importes
export async function avanzarEtapa(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await siniestroEditable(usuario, texto(fd, "id_siniestro"), { abierto: true });
  if ("error" in r) return { error: r.error };
  const s = r.siniestro;
  const entrada = etapaSchema.safeParse({ fecha: texto(fd, "fecha"), observaciones: texto(fd, "observaciones") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const abierta = await db.siniestro_etapas.findFirst({ where: { id_siniestro: s.id, fecha_fin: null }, include: { flujo_etapas: true } });
  if (abierta && fd.get("sin_documentos") !== "on") {
    const subidos = await db.documentos.findMany({ where: { id_siniestro: s.id, retirado: false }, select: { tipo_documento: true } });
    const faltan = documentosFaltantes(abierta.flujo_etapas.documentos_requeridos, subidos.map((d) => d.tipo_documento));
    if (faltan.length) return { error: `Faltan documentos de la etapa «${abierta.flujo_etapas.nombre}»: ${faltan.join(", ")}. Súbelos o marca «Continuar sin esos documentos».` };
  }
  let siguiente: string | null;
  try {
    siguiente = await db.$transaction((tx) => avanzarEtapaTx(tx, usuario.id, s.id, entrada.data.fecha, entrada.data.observaciones));
  } catch (error) {
    return errorDe(error, "avanzarEtapa");
  }
  return volver(s.id, siguiente ? `Etapa terminada. Ahora: ${siguiente}.` : "Flujo completo. Ya puedes cerrar el expediente.");
}

export async function registrarActuacion(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await siniestroEditable(usuario, texto(fd, "id_siniestro"));
  if ("error" in r) return { error: r.error };
  const s = r.siniestro;
  const entrada = actuacionSchema.safeParse({ fecha: texto(fd, "fecha"), descripcion: texto(fd, "descripcion") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  await db.$transaction(async (tx) => {
    await tx.siniestro_actuaciones.create({ data: { empresa: s.empresa, id_siniestro: s.id, fecha: fecha(entrada.data.fecha), descripcion: entrada.data.descripcion, creado_por: usuario.id } });
    await bitacora(tx, usuario.id, s.empresa, s.id, `${s.numero_expediente} | ACTUACIÓN del ${entrada.data.fecha}: ${entrada.data.descripcion.slice(0, 200)}`, "ACTUACION");
  });
  revalidatePath(ruta(s.id));
  return { ok: true, mensaje: "Actuación registrada." };
}

export async function registrarImporte(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await siniestroEditable(usuario, texto(fd, "id_siniestro"));
  if ("error" in r) return { error: r.error };
  const s = r.siniestro;
  const entrada = importeSchema.safeParse({ tipo: texto(fd, "tipo"), monto: texto(fd, "monto"), fecha: texto(fd, "fecha"), referencia: texto(fd, "referencia"), motivo: texto(fd, "motivo") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  let avisos: string[];
  try {
    avisos = await db.$transaction((tx) => registrarImporteTx(tx, usuario.id, s.id, entrada.data), { timeout: 30_000 });
  } catch (error) {
    return errorDe(error, "registrarImporte");
  }
  revalidatePath(ruta(s.id));
  return avisos.length ? { ok: true, mensaje: "Importe registrado.", aviso: avisos.join("\n") } : { ok: true, mensaje: "Importe registrado. El anterior queda en el historial." };
}

/** Cuenta por cobrar del reembolso a la aseguradora (o a quien corresponda). */
export async function generarCuentaPorCobrar(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await siniestroEditable(usuario, texto(fd, "id_siniestro"));
  if ("error" in r) return { error: r.error };
  const s = r.siniestro;
  const entrada = cobroSchema.safeParse({ id_contraparte: texto(fd, "id_contraparte"), monto: texto(fd, "monto"), fecha_vencimiento: texto(fd, "fecha_vencimiento"), documento: texto(fd, "documento") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  if (Number(entrada.data.monto) <= 0) return { errores: { monto: "Debe ser mayor que cero" } };
  try {
    await db.$transaction((tx) => generarCobroTx(tx, usuario.id, s.id, { ...entrada.data, fecha_emision: hoyPlanta() }));
  } catch (error) {
    return errorDe(error, "generarCuentaPorCobrar");
  }
  revalidatePath("/finanzas/primas");
  return volver(s.id, "Cuenta por cobrar creada. Los cobros se registran en Finanzas → Cuentas por cobrar.");
}

// ---------------------------------------------------------------- cierre
export async function cerrarSiniestro(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await siniestroEditable(usuario, texto(fd, "id_siniestro"), { abierto: true });
  if ("error" in r) return { error: r.error };
  const s = r.siniestro;
  const entrada = cierreSchema.safeParse({ fecha: texto(fd, "fecha"), motivo: texto(fd, "motivo") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  if (entrada.data.fecha < iso(s.fecha_notificacion)) return { errores: { fecha: "No puede ser anterior a la notificación" } };
  await db.$transaction(async (tx) => {
    await tx.siniestro_etapas.updateMany({ where: { id_siniestro: s.id, fecha_fin: null }, data: { fecha_fin: fecha(entrada.data.fecha) } });
    await tx.siniestros.update({ where: { id: s.id }, data: { estado: "cerrado", cerrado_en: fecha(entrada.data.fecha), motivo_cierre: entrada.data.motivo, actualizado_por: usuario.id, actualizado_en: new Date() } });
    await bitacora(tx, usuario.id, s.empresa, s.id, `${s.numero_expediente} | CERRADO el ${entrada.data.fecha} (la cuenta por cobrar, si hay, sigue abierta hasta cobrarse)`, "CERRAR", entrada.data.motivo);
  });
  return volver(s.id, "Expediente cerrado. Si queda saldo por cobrar, sigue en Finanzas.");
}

export async function reabrirSiniestro(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await siniestroEditable(usuario, texto(fd, "id_siniestro"));
  if ("error" in r) return { error: r.error };
  const s = r.siniestro;
  if (s.estado !== "cerrado") return { error: "El expediente no está cerrado." };
  const motivo = texto(fd, "motivo").trim();
  if (motivo.length < 3) return { errores: { motivo: "Indica el motivo" } };
  await db.$transaction(async (tx) => {
    await tx.siniestros.update({ where: { id: s.id }, data: { estado: "abierto", cerrado_en: null, motivo_cierre: null, actualizado_por: usuario.id, actualizado_en: new Date() } });
    await bitacora(tx, usuario.id, s.empresa, s.id, `${s.numero_expediente} | REABIERTO`, "REABRIR", motivo);
  });
  return volver(s.id, "Expediente reabierto.");
}

/** Anula un expediente registrado por error (exige «Anular y ajustar» y que no tenga cobros). */
export async function anularSiniestro(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await siniestroEditable(usuario, texto(fd, "id_siniestro"));
  if ("error" in r) return { error: r.error };
  const s = r.siniestro;
  if (sinPermiso(usuario, s.empresa, "movimientos.anular")) return { error: "Anular expedientes requiere el permiso «Anular y ajustar»." };
  const motivo = texto(fd, "motivo").trim();
  if (motivo.length < 3) return { errores: { motivo: "Indica el motivo" } };
  const cobros = await db.obligaciones.count({ where: { id_siniestro: s.id, estado: "vigente" } });
  if (cobros) return { error: "Tiene cuentas por cobrar vigentes: anúlalas primero en Finanzas." };
  await db.$transaction(async (tx) => {
    await tx.siniestro_etapas.updateMany({ where: { id_siniestro: s.id, fecha_fin: null }, data: { fecha_fin: fecha(hoyPlanta() < iso(s.fecha_notificacion) ? iso(s.fecha_notificacion) : hoyPlanta()) } });
    await tx.siniestros.update({ where: { id: s.id }, data: { estado: "anulado", cerrado_en: fecha(hoyPlanta()), motivo_cierre: motivo, actualizado_por: usuario.id, actualizado_en: new Date() } });
    await bitacora(tx, usuario.id, s.empresa, s.id, `${s.numero_expediente} | ANULADO (no consume límites)`, "ANULAR", motivo);
  });
  return volver(s.id, "Expediente anulado.");
}

// ---------------------------------------------------------------- límites del período (riesgos diversos)
export async function guardarLimite(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const per = await db.poliza_periodos.findUnique({ where: { id: BigInt(Number(texto(fd, "id_periodo")) || 0) }, include: { polizas: true } });
  if (!per) return { error: "El período ya no existe." };
  const negado = sinPermiso(usuario, per.empresa, "seguros.registrar");
  if (negado) return { error: negado };
  if (per.estado === "anulado") return { error: "El período está anulado." };
  const entrada = limiteSchema.safeParse({ tipo: texto(fd, "tipo"), id_cobertura: texto(fd, "id_cobertura"), monto: texto(fd, "monto"), consume: texto(fd, "consume") || "reconocido", descripcion: texto(fd, "descripcion") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  if (Number(d.monto) <= 0) return { errores: { monto: "Debe ser mayor que cero" } };
  if (d.id_cobertura) {
    const c = await db.coberturas.findUnique({ where: { id: d.id_cobertura } });
    if (c?.id_ramo !== per.polizas.id_ramo) return { errores: { id_cobertura: "Cobertura de otro ramo" } };
  }
  try {
    await db.$transaction(async (tx) => {
      const l = await tx.limites.create({ data: { empresa: per.empresa, id_periodo: per.id, ...d, creado_por: usuario.id } });
      await registrarGestion(usuario.id, "POLIZAS", `PERÍODO ${per.id} | LÍMITE ${d.tipo === "agregado_anual" ? "agregado anual" : "por bien"} ${d.monto} ${per.moneda} (consume ${d.consume}) [límite ${l.id}]`, tx, {
        empresa: per.empresa, entidad: "poliza_periodos", idRegistro: per.id, operacion: "LIMITE",
      });
    });
  } catch (error) {
    if (codigoPg(error)) return { error: "No se pudo guardar el límite." };
    throw error;
  }
  revalidatePath(`/polizas/periodos/${per.id}`);
  return { ok: true, mensaje: "Límite guardado." };
}

export async function quitarLimite(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const l = await db.limites.findUnique({ where: { id: BigInt(Number(texto(fd, "id")) || 0) } });
  if (!l || !l.activo) return { error: "El límite ya no está activo." };
  const negado = sinPermiso(usuario, l.empresa, "seguros.registrar");
  if (negado) return { error: negado };
  await db.$transaction(async (tx) => {
    await tx.limites.update({ where: { id: l.id }, data: { activo: false } });
    await registrarGestion(usuario.id, "POLIZAS", `PERÍODO ${l.id_periodo} | LÍMITE ${l.id} DESACTIVADO`, tx, { empresa: l.empresa, entidad: "poliza_periodos", idRegistro: l.id_periodo, operacion: "LIMITE" });
  });
  revalidatePath(`/polizas/periodos/${l.id_periodo}`);
  return { ok: true };
}
