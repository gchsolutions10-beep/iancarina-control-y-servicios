"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describirCambios, registrarGestion } from "@/lib/auditoria";
import { requerirSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { sumarAnios } from "@/lib/dominio/vigencias";
import type { EstadoAccion } from "@/lib/estado-accion";
import { codigoPg, sinPermiso } from "@/lib/fichas/acceso";
import { recalcularPeriodo, resumirFaltantes } from "@/lib/polizas/calcular";
import { leerAsegurado, parteDeEmpresa, periodoEditable, siguienteEndoso, sujetoValido } from "@/lib/polizas/edicion";
import { ROLES_PERIODO } from "@/lib/polizas/datos";
import { hoyPlanta } from "@/lib/tiempo";
import { erroresDeZod } from "@/lib/validations/comunes";
import { nombreParte } from "@/lib/validations/fichas";
import { beneficiarioSchema, confirmarSchema, parteSchema, polizaSchema, primaAseguradoraSchema, tarifaSchema } from "@/lib/validations/polizas";

/**
 * Pólizas y períodos en preparación. Toda escritura: sesión → permiso en la empresa del registro →
 * Zod → transacción con bitácora. Un período confirmado no se toca aquí: sus cambios van por
 * endoso (actions/endosos.ts) y la base lo impide además con disparadores.
 */

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "");
const fecha = (v: string) => new Date(`${v}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const rutaPeriodo = (id: bigint | number) => `/polizas/periodos/${id}`;
const MODULO = "POLIZAS";

// ---------------------------------------------------------------- póliza nueva
/** Crea la póliza con su primera vigencia en preparación y el tomador. */
export async function crearPoliza(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const empresa = texto(fd, "empresa");
  const negado = sinPermiso(usuario, empresa, "seguros.registrar");
  if (negado) return { error: negado };
  const entrada = polizaSchema.safeParse({
    id_aseguradora: texto(fd, "id_aseguradora"),
    numero: texto(fd, "numero"),
    id_ramo: texto(fd, "id_ramo"),
    descripcion: texto(fd, "descripcion"),
    moneda: texto(fd, "moneda"),
    vigencia_desde: texto(fd, "vigencia_desde"),
    vigencia_hasta: texto(fd, "vigencia_hasta"),
    id_tomador: texto(fd, "id_tomador"),
  });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  const aseguradora = await parteDeEmpresa(d.id_aseguradora, empresa);
  if (!aseguradora?.funciones.includes("Aseguradora")) return { error: "Elige una aseguradora de esta empresa.", errores: { id_aseguradora: "No válida" } };
  const tomador = await parteDeEmpresa(d.id_tomador, empresa);
  if (!tomador) return { error: "Elige un tomador activo de esta empresa.", errores: { id_tomador: "No válido" } };
  const ramo = await db.ramos.findUnique({ where: { id: d.id_ramo } });
  if (!ramo?.activo) return { errores: { id_ramo: "Ramo no válido" } };
  const hasta = d.vigencia_hasta ?? sumarAnios(d.vigencia_desde);

  let idPeriodo: bigint;
  try {
    idPeriodo = await db.$transaction(async (tx) => {
      const p = await tx.polizas.create({ data: { empresa, id_aseguradora: d.id_aseguradora, numero: d.numero, id_ramo: d.id_ramo, descripcion: d.descripcion, creado_por: usuario.id } });
      const per = await tx.poliza_periodos.create({
        data: { empresa, id_poliza: p.id, numero_periodo: 1, vigencia_desde: fecha(d.vigencia_desde), vigencia_hasta: fecha(hasta), moneda: d.moneda, creado_por: usuario.id },
      });
      await tx.periodo_partes.create({ data: { empresa, id_periodo: per.id, rol: "tomador", id_parte: d.id_tomador, desde: fecha(d.vigencia_desde), creado_por: usuario.id } });
      await registrarGestion(
        usuario.id,
        MODULO,
        `ID ${p.id} | NUEVA PÓLIZA ${d.numero} · ${aseguradora.razon_social} · ${ramo.nombre} · vigencia ${d.vigencia_desde} a ${hasta} (${d.moneda}) · tomador ${nombreParte(tomador)}`,
        tx,
        { empresa, entidad: "polizas", idRegistro: p.id, operacion: "CREAR" },
      );
      return per.id;
    });
  } catch (error) {
    if (codigoPg(error) === "23505") return { error: "Esa aseguradora ya tiene una póliza con ese número en esta empresa.", errores: { numero: "Número repetido" } };
    console.error("[crearPoliza]", error);
    return { error: "No se pudo crear la póliza. Intenta de nuevo." };
  }
  revalidatePath("/polizas/lista");
  redirect(`${rutaPeriodo(idPeriodo)}?creada=1`);
}

/** Modifica la descripción de la póliza (el número y la aseguradora no cambian). */
export async function guardarDescripcionPoliza(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const p = await db.polizas.findUnique({ where: { id: BigInt(Number(texto(fd, "id")) || 0) } });
  if (!p) return { error: "La póliza ya no existe." };
  const negado = sinPermiso(usuario, p.empresa, "seguros.registrar");
  if (negado) return { error: negado };
  const descripcion = texto(fd, "descripcion").trim().slice(0, 1000) || null;
  await db.$transaction(async (tx) => {
    await tx.polizas.update({ where: { id: p.id }, data: { descripcion, actualizado_por: usuario.id, actualizado_en: new Date() } });
    const cambios = describirCambios(Number(p.id), { descripcion: p.descripcion }, { descripcion });
    if (cambios) await registrarGestion(usuario.id, MODULO, cambios, tx, { empresa: p.empresa, entidad: "polizas", idRegistro: p.id, operacion: "MODIFICAR" });
  });
  revalidatePath(`/polizas/${p.id}`);
  return { ok: true, mensaje: "Cambios guardados." };
}

// ---------------------------------------------------------------- partes del período en preparación
export async function asignarParte(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"));
  if ("error" in r) return { error: r.error };
  const { periodo } = r;
  const entrada = parteSchema.safeParse({ rol: texto(fd, "rol"), id_parte: texto(fd, "id_parte") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const parte = await parteDeEmpresa(entrada.data.id_parte, periodo.empresa);
  if (!parte) return { errores: { id_parte: "Elige una persona o empresa activa de esta empresa" } };
  await db.$transaction(async (tx) => {
    // En preparación se reemplaza (no hay nada confirmado que conservar).
    await tx.periodo_partes.deleteMany({ where: { id_periodo: periodo.id, rol: entrada.data.rol } });
    await tx.periodo_partes.create({ data: { empresa: periodo.empresa, id_periodo: periodo.id, rol: entrada.data.rol, id_parte: entrada.data.id_parte, desde: periodo.vigencia_desde, creado_por: usuario.id } });
    await registrarGestion(usuario.id, MODULO, `PERÍODO ${periodo.id} | ${ROLES_PERIODO[entrada.data.rol].toUpperCase()}: ${nombreParte(parte)}`, tx, {
      empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: "PARTE",
    });
  });
  revalidatePath(rutaPeriodo(periodo.id));
  return { ok: true, mensaje: `${ROLES_PERIODO[entrada.data.rol]} guardado.` };
}

export async function quitarParte(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"));
  if ("error" in r) return { error: r.error };
  const rol = texto(fd, "rol");
  if (rol === "tomador") return { error: "El tomador es obligatorio: reemplázalo en vez de quitarlo." };
  await db.$transaction(async (tx) => {
    await tx.periodo_partes.deleteMany({ where: { id_periodo: r.periodo.id, rol } });
    await registrarGestion(usuario.id, MODULO, `PERÍODO ${r.periodo.id} | ${rol.toUpperCase()} QUITADO`, tx, { empresa: r.periodo.empresa, entidad: "poliza_periodos", idRegistro: r.periodo.id, operacion: "PARTE" });
  });
  revalidatePath(rutaPeriodo(r.periodo.id));
  return { ok: true };
}

// ---------------------------------------------------------------- tarifas
export async function guardarTarifa(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"));
  if ("error" in r) return { error: r.error };
  const { periodo } = r;
  const entrada = tarifaSchema.safeParse({ id_cobertura: texto(fd, "id_cobertura"), clase: texto(fd, "clase"), tasa: texto(fd, "tasa"), prima_fija: texto(fd, "prima_fija") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  const cobertura = await db.coberturas.findUnique({ where: { id: d.id_cobertura } });
  if (!cobertura || cobertura.id_ramo !== periodo.polizas.id_ramo) return { errores: { id_cobertura: "Cobertura de otro ramo" } };
  await db.$transaction(async (tx) => {
    await tx.periodo_tarifas.deleteMany({ where: { id_periodo: periodo.id, id_cobertura: d.id_cobertura, clase: d.clase } });
    await tx.periodo_tarifas.create({
      data: { empresa: periodo.empresa, id_periodo: periodo.id, id_cobertura: d.id_cobertura, clase: d.clase, tasa: d.tasa === null ? null : String(d.tasa), prima_fija: d.prima_fija, creado_por: usuario.id },
    });
    await registrarGestion(
      usuario.id,
      MODULO,
      `PERÍODO ${periodo.id} | TARIFA ${cobertura.nombre}${d.clase ? ` (clase ${d.clase})` : ""}: tasa ${d.tasa ?? "—"} % · prima fija ${d.prima_fija ?? "—"} ${periodo.moneda}`,
      tx,
      { empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: "TARIFA" },
    );
  });
  revalidatePath(rutaPeriodo(periodo.id));
  return { ok: true, mensaje: "Tarifa guardada. Pulsa «Calcular primas» para aplicarla." };
}

export async function quitarTarifa(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"));
  if ("error" in r) return { error: r.error };
  const t = await db.periodo_tarifas.findUnique({ where: { id: BigInt(Number(texto(fd, "id")) || 0) }, include: { coberturas: true } });
  if (!t || t.id_periodo !== r.periodo.id) return { error: "La tarifa ya no existe." };
  await db.$transaction(async (tx) => {
    await tx.periodo_tarifas.delete({ where: { id: t.id } });
    await registrarGestion(usuario.id, MODULO, `PERÍODO ${r.periodo.id} | TARIFA QUITADA ${t.coberturas.nombre}${t.clase ? ` (clase ${t.clase})` : ""}`, tx, {
      empresa: r.periodo.empresa, entidad: "poliza_periodos", idRegistro: r.periodo.id, operacion: "TARIFA",
    });
  });
  revalidatePath(rutaPeriodo(r.periodo.id));
  return { ok: true };
}

// ---------------------------------------------------------------- asegurados del período en preparación
export async function agregarAsegurado(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"));
  if ("error" in r) return { error: r.error };
  const { periodo } = r;
  const entrada = await leerAsegurado(fd);
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  const sujeto = await sujetoValido(periodo.polizas.ramos.sujeto, d.id_sujeto, periodo.empresa);
  if (!sujeto) return { errores: { id_sujeto: "Elige una ficha activa de esta empresa" } };
  const coberturas = await db.coberturas.findMany({ where: { id: { in: d.coberturas }, id_ramo: periodo.polizas.id_ramo }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
  if (coberturas.length !== d.coberturas.length) return { errores: { coberturas: "Hay coberturas de otro ramo" } };
  const desde = d.desde ?? iso(periodo.vigencia_desde);
  if (desde < iso(periodo.vigencia_desde) || desde >= iso(periodo.vigencia_hasta)) return { errores: { desde: "Debe estar dentro de la vigencia" } };

  try {
    await db.$transaction(async (tx) => {
      const inc = await tx.inclusiones.create({
        data: {
          empresa: periodo.empresa,
          id_periodo: periodo.id,
          [sujeto.columna]: d.id_sujeto,
          certificado: d.certificado,
          ceco: d.ceco,
          clase_tarifa: d.clase_tarifa ?? sujeto.clase,
          desde: fecha(desde),
          hasta: periodo.vigencia_hasta,
          valor_bien: d.valor_bien ?? sujeto.valor,
          aditamentos: d.aditamentos,
          suma_asegurada: d.suma_asegurada,
          observaciones: d.observaciones,
          creado_por: usuario.id,
        },
      });
      await tx.inclusion_coberturas.createMany({ data: coberturas.map((c) => ({ empresa: periodo.empresa, id_inclusion: inc.id, id_cobertura: c.id, creado_por: usuario.id })) });
      await registrarGestion(usuario.id, MODULO, `PERÍODO ${periodo.id} | ASEGURADO: ${sujeto.nombre} desde ${desde} · ${coberturas.map((c) => c.nombre).join(", ")}`, tx, {
        empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: "ASEGURADO",
      });
      // Se calcula de una vez para que se vea la prima (o lo que falta).
      await recalcularPeriodo(tx, periodo.id, usuario.id);
    });
  } catch (error) {
    if (codigoPg(error) === "23P01") return { error: "Ese asegurado ya está incluido en este período en esas fechas.", errores: { id_sujeto: "Ya incluido" } };
    console.error("[agregarAsegurado]", error);
    return { error: "No se pudo agregar. Intenta de nuevo." };
  }
  revalidatePath(rutaPeriodo(periodo.id));
  return { ok: true, mensaje: `${sujeto.nombre} agregado y calculado.` };
}

export async function quitarAsegurado(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"));
  if ("error" in r) return { error: r.error };
  const inc = await db.inclusiones.findUnique({ where: { id: BigInt(Number(texto(fd, "id")) || 0) }, include: { vehiculos: true, propiedades: true, partes: true } });
  if (!inc || inc.id_periodo !== r.periodo.id) return { error: "El asegurado ya no está en el período." };
  const nombre = inc.vehiculos?.placa ?? inc.propiedades?.nombre ?? (inc.partes ? nombreParte(inc.partes) : "");
  await db.$transaction(async (tx) => {
    await tx.beneficiarios.deleteMany({ where: { id_inclusion: inc.id } });
    await tx.inclusion_coberturas.deleteMany({ where: { id_inclusion: inc.id } });
    await tx.inclusiones.delete({ where: { id: inc.id } });
    await registrarGestion(usuario.id, MODULO, `PERÍODO ${r.periodo.id} | ASEGURADO QUITADO (en preparación): ${nombre}`, tx, {
      empresa: r.periodo.empresa, entidad: "poliza_periodos", idRegistro: r.periodo.id, operacion: "ASEGURADO",
    });
  });
  revalidatePath(rutaPeriodo(r.periodo.id));
  return { ok: true, mensaje: "Quitado." };
}

// ---------------------------------------------------------------- cálculo
export async function calcularPrimas(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"));
  if ("error" in r) return { error: r.error };
  const resultado = await db.$transaction((tx) => recalcularPeriodo(tx, r.periodo.id, usuario.id), { timeout: 60_000 });
  revalidatePath(rutaPeriodo(r.periodo.id));
  if (resultado.pendientes.length) return { aviso: `Cálculo guardado como simulación. Falta: ${resumirFaltantes(resultado.pendientes)}.` };
  return { ok: true, mensaje: `Primas calculadas (${resultado.lineas} coberturas).` };
}

/** Reemplaza la prima calculada por la que indicó la aseguradora (se conserva la original y el motivo). */
export async function fijarPrimaAseguradora(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"));
  if ("error" in r) return { error: r.error };
  const ic = await db.inclusion_coberturas.findUnique({ where: { id: BigInt(Number(texto(fd, "id")) || 0) }, include: { inclusiones: true, coberturas: true } });
  if (!ic || ic.inclusiones.id_periodo !== r.periodo.id) return { error: "La cobertura ya no existe." };
  const entrada = primaAseguradoraSchema.safeParse({ prima: texto(fd, "prima"), motivo: texto(fd, "motivo") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const { prima, motivo } = entrada.data;
  await db.$transaction(async (tx) => {
    await tx.inclusion_coberturas.update({
      where: { id: ic.id },
      data: { prima_anual: prima, prima_periodo: prima, origen: "aseguradora", prima_calculada: ic.origen === "calculada" ? ic.prima_periodo : ic.prima_calculada, motivo_ajuste: motivo, ajustado_por: usuario.id },
    });
    await registrarGestion(
      usuario.id,
      MODULO,
      `PERÍODO ${r.periodo.id} | PRIMA DE LA ASEGURADORA en ${ic.coberturas.nombre} (asegurado ${ic.id_inclusion}): calculada ${ic.prima_periodo?.toFixed(2) ?? "sin calcular"} -> ${prima} ${r.periodo.moneda}`,
      tx,
      { empresa: r.periodo.empresa, entidad: "poliza_periodos", idRegistro: r.periodo.id, operacion: "AJUSTE PRIMA", motivo },
    );
  });
  revalidatePath(rutaPeriodo(r.periodo.id));
  return { ok: true, mensaje: "Prima de la aseguradora registrada." };
}

/** Vuelve a la prima calculada por regla. */
export async function quitarPrimaAseguradora(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"));
  if ("error" in r) return { error: r.error };
  const ic = await db.inclusion_coberturas.findUnique({ where: { id: BigInt(Number(texto(fd, "id")) || 0) }, include: { inclusiones: true, coberturas: true } });
  if (!ic || ic.inclusiones.id_periodo !== r.periodo.id || ic.origen !== "aseguradora") return { error: "No tiene prima de la aseguradora." };
  await db.$transaction(async (tx) => {
    await tx.inclusion_coberturas.update({ where: { id: ic.id }, data: { prima_anual: null, prima_periodo: null, origen: null, prima_calculada: null, motivo_ajuste: null, ajustado_por: null } });
    await registrarGestion(usuario.id, MODULO, `PERÍODO ${r.periodo.id} | PRIMA DE LA ASEGURADORA QUITADA en ${ic.coberturas.nombre} (asegurado ${ic.id_inclusion})`, tx, {
      empresa: r.periodo.empresa, entidad: "poliza_periodos", idRegistro: r.periodo.id, operacion: "AJUSTE PRIMA",
    });
    await recalcularPeriodo(tx, r.periodo.id, usuario.id);
  });
  revalidatePath(rutaPeriodo(r.periodo.id));
  return { ok: true, mensaje: "Se volvió a la prima calculada." };
}

// ---------------------------------------------------------------- beneficiarios (en preparación)
export async function agregarBeneficiario(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"), ["borrador", "confirmado"]);
  if ("error" in r) return { error: r.error };
  const { periodo } = r;
  const inc = await db.inclusiones.findUnique({ where: { id: BigInt(Number(texto(fd, "id_inclusion")) || 0) }, include: { beneficiarios: true } });
  if (!inc || inc.id_periodo !== periodo.id) return { error: "El asegurado ya no está en el período." };
  const entrada = beneficiarioSchema.safeParse({ id_parte: texto(fd, "id_parte"), parentesco: texto(fd, "parentesco"), porcentaje: texto(fd, "porcentaje"), fecha: texto(fd, "fecha") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  const parte = await parteDeEmpresa(d.id_parte, periodo.empresa);
  if (!parte) return { errores: { id_parte: "Elige una persona activa de esta empresa" } };
  const confirmado = periodo.estado === "confirmado";
  const desde = confirmado ? d.fecha : iso(inc.desde);
  if (!desde) return { errores: { fecha: "Indica la fecha efectiva del cambio" } };
  if (desde < iso(inc.desde) || desde >= iso(inc.hasta)) return { errores: { fecha: "Debe estar dentro de la cobertura del asegurado" } };
  const vigentesEnFecha = inc.beneficiarios.filter((b) => iso(b.desde) <= desde && (!b.hasta || iso(b.hasta) > desde));
  const total = vigentesEnFecha.reduce((s, b) => s.plus(b.porcentaje.toString()), new Decimal(d.porcentaje!));
  if (total.gt(100)) return { errores: { porcentaje: `Los beneficiarios sumarían ${total.toString()} % (máximo 100 %)` } };

  try {
    await db.$transaction(async (tx) => {
      const endoso = confirmado
        ? await tx.endosos.create({
            data: {
              empresa: periodo.empresa, id_periodo: periodo.id, numero: await siguienteEndoso(tx, periodo.id), tipo: "beneficiarios", fecha_efectiva: fecha(desde),
              retroactivo: desde < hoyPlanta(), descripcion: `Beneficiario ${nombreParte(parte)} (${d.porcentaje} %) del asegurado ${inc.id}`, creado_por: usuario.id,
            },
          })
        : null;
      await tx.beneficiarios.create({
        data: { empresa: periodo.empresa, id_inclusion: inc.id, id_parte: d.id_parte, parentesco: d.parentesco, porcentaje: String(d.porcentaje), desde: fecha(desde), id_endoso: endoso?.id ?? null, creado_por: usuario.id },
      });
      await registrarGestion(usuario.id, MODULO, `PERÍODO ${periodo.id} | BENEFICIARIO ${nombreParte(parte)} ${d.porcentaje} % del asegurado ${inc.id} desde ${desde}${endoso ? ` (endoso ${endoso.numero})` : ""}`, tx, {
        empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: endoso ? "ENDOSO" : "BENEFICIARIO",
      });
    });
  } catch (error) {
    if (codigoPg(error) === "23P01") return { error: "Esa persona ya es beneficiaria en esas fechas." };
    console.error("[agregarBeneficiario]", error);
    return { error: "No se pudo guardar." };
  }
  revalidatePath(rutaPeriodo(periodo.id));
  return { ok: true, mensaje: confirmado ? "Beneficiario registrado por endoso." : "Beneficiario agregado." };
}

export async function quitarBeneficiario(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"), ["borrador", "confirmado"]);
  if ("error" in r) return { error: r.error };
  const { periodo } = r;
  const b = await db.beneficiarios.findUnique({ where: { id: BigInt(Number(texto(fd, "id")) || 0) }, include: { inclusiones: true, partes: true } });
  if (!b || b.inclusiones.id_periodo !== periodo.id || b.hasta) return { error: "El beneficiario ya no está vigente." };
  const confirmado = periodo.estado === "confirmado";
  const hasta = texto(fd, "fecha");
  if (confirmado && (!/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta <= iso(b.desde) || hasta > iso(b.inclusiones.hasta))) {
    return { error: `Indica la fecha efectiva (después del ${iso(b.desde)}).` };
  }
  await db.$transaction(async (tx) => {
    if (confirmado) {
      const e = await tx.endosos.create({
        data: {
          empresa: periodo.empresa, id_periodo: periodo.id, numero: await siguienteEndoso(tx, periodo.id), tipo: "beneficiarios", fecha_efectiva: fecha(hasta),
          retroactivo: hasta < hoyPlanta(), descripcion: `Termina beneficiario ${nombreParte(b.partes)} del asegurado ${b.id_inclusion}`, creado_por: usuario.id,
        },
      });
      await tx.beneficiarios.update({ where: { id: b.id }, data: { hasta: fecha(hasta) } });
      await registrarGestion(usuario.id, MODULO, `PERÍODO ${periodo.id} | BENEFICIARIO ${nombreParte(b.partes)} TERMINA el ${hasta} (endoso ${e.numero})`, tx, {
        empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: "ENDOSO",
      });
    } else {
      await tx.beneficiarios.delete({ where: { id: b.id } });
      await registrarGestion(usuario.id, MODULO, `PERÍODO ${periodo.id} | BENEFICIARIO QUITADO ${nombreParte(b.partes)}`, tx, { empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: "BENEFICIARIO" });
    }
  });
  revalidatePath(rutaPeriodo(periodo.id));
  return { ok: true };
}

// ---------------------------------------------------------------- confirmar o descartar
/**
 * Confirma el período: recalcula, exige tomador, asegurados y todas las primas completas (si falta
 * un parámetro, dice cuál), marca los cálculos como definitivos y genera la prima por pagar.
 */
export async function confirmarPeriodo(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"));
  if ("error" in r) return { error: r.error };
  const { periodo } = r;
  const entrada = confirmarSchema.safeParse({ fecha_vencimiento: texto(fd, "fecha_vencimiento"), documento: texto(fd, "documento") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const { fecha_vencimiento, documento } = entrada.data;

  if (periodo.id_periodo_anterior) {
    const anterior = await db.poliza_periodos.findUnique({ where: { id: periodo.id_periodo_anterior } });
    if (anterior?.estado !== "confirmado") return { error: "Primero debe estar confirmado el período anterior." };
  }
  const hoy = hoyPlanta();
  let mensaje: string;
  try {
    mensaje = await db.$transaction(
      async (tx) => {
        const calculo = await recalcularPeriodo(tx, periodo.id, usuario.id);
        const tomador = await tx.periodo_partes.findFirst({ where: { id_periodo: periodo.id, rol: "tomador" } });
        if (!tomador) throw new Bloqueo("Falta el tomador.");
        if (calculo.lineas === 0) throw new Bloqueo("El período no tiene asegurados.");
        if (calculo.pendientes.length) throw new Bloqueo(`No se puede confirmar: falta ${resumirFaltantes(calculo.pendientes)}. Cárgalo en las tarifas o registra el importe de la aseguradora.`);

        const lineas = await tx.inclusion_coberturas.findMany({ where: { inclusiones: { id_periodo: periodo.id } }, include: { coberturas: true } });
        const total = lineas.filter((l) => !l.coberturas.incluida_en_padre).reduce((s, l) => s.plus(l.prima_periodo!.toString()), new Decimal(0));
        const calculos = [...lineas.map((l) => l.id_calculo), ...(await tx.inclusiones.findMany({ where: { id_periodo: periodo.id }, select: { id_calculo_suma: true } })).map((i) => i.id_calculo_suma)].filter(
          (x): x is bigint => x !== null,
        );
        await tx.calculos.updateMany({ where: { id: { in: calculos } }, data: { estado: "definitivo" } });
        await tx.poliza_periodos.update({ where: { id: periodo.id }, data: { estado: "confirmado", confirmado_por: usuario.id, confirmado_en: new Date() } });

        let detalle = "sin prima";
        if (total.gt(0)) {
          const o = await tx.obligaciones.create({
            data: {
              empresa: periodo.empresa, naturaleza: "por_pagar", concepto: "prima", id_contraparte: periodo.polizas.id_aseguradora, id_periodo: periodo.id, moneda: periodo.moneda,
              fecha_emision: fecha(hoy < iso(periodo.vigencia_desde) ? hoy : iso(periodo.vigencia_desde)), fecha_vencimiento: fecha(fecha_vencimiento), documento,
              descripcion: `Prima póliza ${periodo.polizas.numero}, período ${periodo.numero_periodo} (${iso(periodo.vigencia_desde)} a ${iso(periodo.vigencia_hasta)})`, creado_por: usuario.id,
            },
          });
          await tx.obligacion_movimientos.create({ data: { empresa: periodo.empresa, id_obligacion: o.id, tipo: "cargo", monto: total.toFixed(2), fecha: o.fecha_emision, motivo: "Confirmación del período", creado_por: usuario.id } });
          detalle = `prima por pagar ${total.toFixed(2)} ${periodo.moneda} (obligación ${o.id}, vence ${fecha_vencimiento})`;
        }
        await registrarGestion(usuario.id, MODULO, `PERÍODO ${periodo.id} | CONFIRMADO · ${lineas.length} coberturas · ${detalle}`, tx, {
          empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: "CONFIRMAR",
        });
        return `Período confirmado: ${detalle}.`;
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    if (error instanceof Bloqueo) {
      revalidatePath(rutaPeriodo(periodo.id));
      return { error: error.message };
    }
    console.error("[confirmarPeriodo]", error);
    return { error: "No se pudo confirmar. Intenta de nuevo." };
  }
  revalidatePath("/finanzas/primas");
  revalidatePath(rutaPeriodo(periodo.id));
  redirect(`${rutaPeriodo(periodo.id)}?hecho=${encodeURIComponent(mensaje)}`);
}

class Bloqueo extends Error {}

/** Descarta un período en preparación (queda anulado con su motivo; no se borra). */
export async function descartarPeriodo(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"));
  if ("error" in r) return { error: r.error };
  const motivo = texto(fd, "motivo").trim();
  if (motivo.length < 3) return { errores: { motivo: "Indica el motivo" } };
  await db.$transaction(async (tx) => {
    await tx.poliza_periodos.update({ where: { id: r.periodo.id }, data: { estado: "anulado" } });
    await registrarGestion(usuario.id, MODULO, `PERÍODO ${r.periodo.id} | DESCARTADO (estaba en preparación)`, tx, { empresa: r.periodo.empresa, entidad: "poliza_periodos", idRegistro: r.periodo.id, operacion: "ANULAR", motivo });
  });
  redirect(`/polizas/${r.periodo.id_poliza}`);
}
