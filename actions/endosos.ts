"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registrarGestion } from "@/lib/auditoria";
import { requerirSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { elegirRegla, prorratear } from "@/lib/dominio/calculo/motor";
import { elegibleParaRenovar } from "@/lib/dominio/elegibilidad";
import { diasEntre, sumarAnios } from "@/lib/dominio/vigencias";
import type { EstadoAccion } from "@/lib/estado-accion";
import { codigoPg, sinPermiso } from "@/lib/fichas/acceso";
import { formatearImporte } from "@/lib/formato";
import { calcularPrimaLinea, calcularSuma, guardarCalculo, prepararMotor, recalcularPeriodo } from "@/lib/polizas/calcular";
import { ROLES_PERIODO } from "@/lib/polizas/datos";
import { leerAsegurado, parteDeEmpresa, periodoEditable, siguienteEndoso, sujetoValido } from "@/lib/polizas/edicion";
import { hoyPlanta } from "@/lib/tiempo";
import { erroresDeZod } from "@/lib/validations/comunes";
import { nombreParte } from "@/lib/validations/fichas";
import { endosoSchema, parteSchema } from "@/lib/validations/polizas";

/**
 * Endosos de un período confirmado (único camino para cambiarlo) y renovación anual.
 * Altas y bajas se pueden «Simular» (no guarda nada) y luego «Confirmar» con el número de endoso
 * de la aseguradora. Si el cálculo está incompleto, solo se confirma con el importe de la
 * aseguradora (y su motivo). Cada endoso con prima genera su obligación: por pagar si cobra,
 * por cobrar si devuelve.
 */

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "");
const fecha = (v: string) => new Date(`${v}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ruta = (id: bigint) => `/polizas/periodos/${id}`;
const MODULO = "POLIZAS";

class Bloqueo extends Error {}

function leerEndoso(fd: FormData) {
  return endosoSchema.safeParse({
    fecha_efectiva: texto(fd, "fecha_efectiva"),
    numero_aseguradora: texto(fd, "numero_aseguradora"),
    importe_aseguradora: texto(fd, "importe_aseguradora"),
    motivo: texto(fd, "motivo"),
  });
}

const vencimiento = (fd: FormData, defecto: string) => {
  const v = texto(fd, "fecha_vencimiento");
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= defecto ? v : defecto;
};

// ---------------------------------------------------------------- alta
export async function altaPorEndoso(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"), ["confirmado"]);
  if ("error" in r) return { error: r.error };
  const { periodo } = r;
  const asegurado = await leerAsegurado(fd);
  const endoso = leerEndoso(fd);
  if (!asegurado.success || !endoso.success) {
    return { error: "Revisa los campos marcados.", errores: { ...(asegurado.success ? {} : erroresDeZod(asegurado.error)), ...(endoso.success ? {} : erroresDeZod(endoso.error)) } };
  }
  const d = asegurado.data;
  const e = endoso.data;
  const f = e.fecha_efectiva;
  if (f < iso(periodo.vigencia_desde) || f >= iso(periodo.vigencia_hasta)) return { errores: { fecha_efectiva: "Debe estar dentro de la vigencia" } };
  const sujeto = await sujetoValido(periodo.polizas.ramos.sujeto, d.id_sujeto, periodo.empresa);
  if (!sujeto) return { errores: { id_sujeto: "Elige una ficha activa de esta empresa" } };
  const coberturas = await db.coberturas.findMany({ where: { id: { in: d.coberturas }, id_ramo: periodo.polizas.id_ramo }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
  if (coberturas.length !== d.coberturas.length) return { errores: { coberturas: "Hay coberturas de otro ramo" } };

  const simular = texto(fd, "modo") !== "confirmar";
  const moneda = periodo.moneda;
  try {
    const resultado = await db.$transaction(
      async (tx) => {
        const m = await prepararMotor(tx, periodo.id);
        m.contexto.fecha = f;
        const datos = {
          valor_bien: d.valor_bien === null && sujeto.valor === null ? null : new Decimal(d.valor_bien ?? sujeto.valor!),
          aditamentos: d.aditamentos === null ? null : new Decimal(d.aditamentos),
          suma_asegurada: d.suma_asegurada === null ? null : new Decimal(d.suma_asegurada),
          clase_tarifa: d.clase_tarifa ?? sujeto.clase,
          desde: f,
          hasta: iso(periodo.vigencia_hasta),
        };
        const suma = calcularSuma(m, datos);
        if (suma.resultado) datos.suma_asegurada = suma.suma;
        const lineas = coberturas.map((c) => ({ c, r: calcularPrimaLinea(m, datos, c.id, null) }));
        const faltantes = [...(suma.resultado?.faltantes ?? []), ...lineas.flatMap((l) => l.r.faltantes)];
        const total = lineas.filter((l) => !l.c.incluida_en_padre && l.r.periodo).reduce((s, l) => s.plus(l.r.periodo!), new Decimal(0));
        const dias = diasEntre(f, iso(periodo.vigencia_hasta));
        const detalle = lineas.map((l) => `${l.c.nombre}: ${l.r.anual.valor ? `anual ${formatearImporte(l.r.anual.valor.toFixed(2))} → ${dias} días: ${formatearImporte(l.r.periodo?.toFixed(2) ?? null)}` : `falta ${l.r.faltantes.join(", ")}`}`);

        if (simular) {
          return {
            aviso: [
              `Simulación del alta de ${sujeto.nombre} desde ${f} (${dias} días hasta el fin de la vigencia):`,
              ...detalle,
              faltantes.length ? `Cálculo incompleto. Para confirmar, registra el importe de la aseguradora.` : `Prima del endoso: ${formatearImporte(total.toFixed(2))} ${moneda}.`,
              "Nada se guardó. Revisa y pulsa «Confirmar endoso».",
            ].join("\n"),
          };
        }
        if (faltantes.length && e.importe_aseguradora === null) throw new Bloqueo(`No se puede confirmar: falta ${[...new Set(faltantes)].join("; ")}. Registra el importe de la aseguradora.`);
        const prima = e.importe_aseguradora ?? total.toFixed(2);

        const en = await tx.endosos.create({
          data: {
            empresa: periodo.empresa, id_periodo: periodo.id, numero: await siguienteEndoso(tx, periodo.id), tipo: "alta", fecha_efectiva: fecha(f), numero_aseguradora: e.numero_aseguradora,
            prima, retroactivo: f < hoyPlanta(), descripcion: `Alta de ${sujeto.nombre} (${coberturas.map((c) => c.nombre).join(", ")})`, motivo: e.motivo, creado_por: usuario.id,
          },
        });
        const idSuma = suma.resultado ? await guardarCalculo(tx, periodo.empresa, usuario.id, suma.resultado, "suma_asegurada", moneda, true) : null;
        const inc = await tx.inclusiones.create({
          data: {
            empresa: periodo.empresa, id_periodo: periodo.id, [sujeto.columna]: d.id_sujeto, certificado: d.certificado, ceco: d.ceco, clase_tarifa: datos.clase_tarifa,
            desde: fecha(f), hasta: periodo.vigencia_hasta, valor_bien: datos.valor_bien?.toFixed(2) ?? null, aditamentos: d.aditamentos, suma_asegurada: datos.suma_asegurada?.toFixed(2) ?? null,
            id_calculo_suma: idSuma, id_endoso_alta: en.id, observaciones: d.observaciones, creado_por: usuario.id,
          },
        });
        for (const l of lineas) {
          const idCalc = await guardarCalculo(tx, periodo.empresa, usuario.id, l.r.anual, "prima", moneda, true);
          const completa = l.r.anual.valor !== null && l.r.periodo !== null;
          const ic = await tx.inclusion_coberturas.create({
            data: {
              empresa: periodo.empresa, id_inclusion: inc.id, id_cobertura: l.c.id, id_endoso: en.id, id_calculo: idCalc, creado_por: usuario.id,
              prima_anual: completa ? l.r.anual.valor!.toFixed(2) : null, prima_periodo: completa ? l.r.periodo!.toFixed(2) : null, origen: completa ? "calculada" : null,
            },
          });
          if (completa) {
            await tx.endoso_lineas.create({
              data: {
                empresa: periodo.empresa, id_endoso: en.id, id_inclusion_cobertura: ic.id, prima_anual: l.r.anual.valor!.toFixed(2), dias: l.r.dias, base_dias: l.r.reglaProrrateo?.base_dias ?? null,
                importe: l.r.periodo!.toFixed(2), origen: "calculada", id_regla_prorrateo: l.r.reglaProrrateo?.id ?? null,
              },
            });
          }
        }
        const obligacion = await crearObligacionEndoso(tx, periodo, en.id, en.numero, new Decimal(prima), f, vencimiento(fd, f), usuario.id, e.numero_aseguradora);
        await registrarGestion(
          usuario.id,
          MODULO,
          `PERÍODO ${periodo.id} | ENDOSO ${en.numero} ALTA de ${sujeto.nombre} desde ${f}: prima ${prima} ${moneda}${e.importe_aseguradora ? ` (importe de la aseguradora; calculado ${faltantes.length ? "incompleto" : total.toFixed(2)})` : ""}${obligacion}`,
          tx,
          { empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: f < hoyPlanta() ? "ENDOSO RETROACTIVO" : "ENDOSO", motivo: e.motivo },
        );
        return { ok: true, mensaje: `Endoso ${en.numero} confirmado: alta de ${sujeto.nombre}, prima ${formatearImporte(prima)} ${moneda}.` };
      },
      { timeout: 60_000 },
    );
    if (!simular) {
      revalidatePath(ruta(periodo.id));
      revalidatePath("/finanzas/primas");
    }
    return resultado;
  } catch (error) {
    if (error instanceof Bloqueo) return { error: error.message };
    if (codigoPg(error) === "23P01") return { error: "Ese asegurado ya está incluido en este período en esas fechas.", errores: { id_sujeto: "Ya incluido" } };
    console.error("[altaPorEndoso]", error);
    return { error: "No se pudo registrar el endoso. Intenta de nuevo." };
  }
}

type PeriodoConPoliza = { id: bigint; empresa: string; moneda: string; numero_periodo: number; polizas: { id_aseguradora: bigint; numero: string } };

/** Obligación del endoso: por pagar si cobra, por cobrar (devolución) si devuelve. */
async function crearObligacionEndoso(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  periodo: PeriodoConPoliza,
  idEndoso: bigint,
  numero: number,
  prima: Decimal,
  emision: string,
  vence: string,
  usuario: number,
  documento: string | null,
) {
  if (prima.isZero()) return "";
  const cobra = prima.gt(0);
  const o = await tx.obligaciones.create({
    data: {
      empresa: periodo.empresa, naturaleza: cobra ? "por_pagar" : "por_cobrar", concepto: cobra ? "ajuste_prima" : "devolucion_prima", id_contraparte: periodo.polizas.id_aseguradora,
      id_periodo: periodo.id, id_endoso: idEndoso, moneda: periodo.moneda, fecha_emision: fecha(emision), fecha_vencimiento: fecha(vence), documento,
      descripcion: `${cobra ? "Prima" : "Devolución de prima"} del endoso ${numero}, póliza ${periodo.polizas.numero} período ${periodo.numero_periodo}`, creado_por: usuario,
    },
  });
  await tx.obligacion_movimientos.create({ data: { empresa: periodo.empresa, id_obligacion: o.id, tipo: "cargo", monto: prima.abs().toFixed(2), fecha: fecha(emision), motivo: `Endoso ${numero}`, creado_por: usuario } });
  return ` · ${cobra ? "por pagar" : "por cobrar"} ${prima.abs().toFixed(2)} (obligación ${o.id})`;
}

// ---------------------------------------------------------------- baja
export async function bajaPorEndoso(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"), ["confirmado"]);
  if ("error" in r) return { error: r.error };
  const { periodo } = r;
  const inc = await db.inclusiones.findUnique({
    where: { id: BigInt(Number(texto(fd, "id_inclusion")) || 0) },
    include: { inclusion_coberturas: { include: { coberturas: true }, orderBy: { coberturas: { orden: "asc" } } }, vehiculos: true, propiedades: true, partes: true },
  });
  if (!inc || inc.id_periodo !== periodo.id) return { error: "El asegurado ya no está en el período." };
  if (inc.id_endoso_baja) return { error: "Ya fue dado de baja." };
  const endoso = leerEndoso(fd);
  if (!endoso.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(endoso.error) };
  const e = endoso.data;
  const f = e.fecha_efectiva;
  if (f <= iso(inc.desde) || f >= iso(inc.hasta)) return { errores: { fecha_efectiva: `Debe ser después del ${iso(inc.desde)} y antes del ${iso(inc.hasta)}` } };
  const nombre = inc.vehiculos?.placa ?? inc.propiedades?.nombre ?? (inc.partes ? nombreParte(inc.partes) : "");
  const dias = diasEntre(f, iso(inc.hasta));
  const simular = texto(fd, "modo") !== "confirmar";

  let resultado: EstadoAccion & { ok?: boolean; mensaje?: string };
  try {
    resultado = await db.$transaction(
      async (tx) => {
        const m = await prepararMotor(tx, periodo.id);
        const lineas = inc.inclusion_coberturas.map((ic) => {
          const regla = elegirRegla(m.reglas, "prorrateo", { ...m.contexto, fecha: f, id_cobertura: ic.id_cobertura, evento: "baja" });
          if (ic.prima_anual === null) return { ic, regla, valor: null, faltante: `prima anual de ${ic.coberturas.nombre} (vino de la aseguradora sin calcular)` };
          const p = prorratear(new Decimal(ic.prima_anual.toString()), dias, regla);
          return { ic, regla, valor: p.valor, faltante: p.faltante };
        });
        const faltantes = lineas.flatMap((l) => (l.faltante ? [l.faltante] : []));
        const devolucion = lineas.filter((l) => !l.ic.coberturas.incluida_en_padre && l.valor).reduce((s, l) => s.plus(l.valor!), new Decimal(0));
        if (simular) {
          return {
            aviso: [
              `Simulación de la baja de ${nombre} el ${f} (${dias} días sin usar):`,
              ...lineas.map((l) => `${l.ic.coberturas.nombre}: ${l.valor ? `devuelve ${formatearImporte(l.valor.toFixed(2))}` : `falta ${l.faltante}`}`),
              faltantes.length ? "Cálculo incompleto. Para confirmar, registra el importe que devuelve la aseguradora." : `Devolución: ${formatearImporte(devolucion.toFixed(2))} ${periodo.moneda}.`,
              "Nada se guardó. Revisa y pulsa «Confirmar endoso».",
            ].join("\n"),
          };
        }
        if (faltantes.length && e.importe_aseguradora === null) throw new Bloqueo(`No se puede confirmar: falta ${faltantes.join("; ")}. Registra el importe de la aseguradora.`);
        const monto = new Decimal(e.importe_aseguradora ?? devolucion.toFixed(2));
        const en = await tx.endosos.create({
          data: {
            empresa: periodo.empresa, id_periodo: periodo.id, numero: await siguienteEndoso(tx, periodo.id), tipo: "baja", fecha_efectiva: fecha(f), numero_aseguradora: e.numero_aseguradora,
            prima: monto.neg().toFixed(2), retroactivo: f < hoyPlanta(), descripcion: `Baja de ${nombre}`, motivo: e.motivo, creado_por: usuario.id,
          },
        });
        await tx.inclusiones.update({ where: { id: inc.id }, data: { hasta: fecha(f), id_endoso_baja: en.id } });
        await tx.beneficiarios.updateMany({ where: { id_inclusion: inc.id, hasta: null, desde: { lt: fecha(f) } }, data: { hasta: fecha(f) } });
        for (const l of lineas) {
          if (!l.valor) continue;
          await tx.endoso_lineas.create({
            data: {
              empresa: periodo.empresa, id_endoso: en.id, id_inclusion_cobertura: l.ic.id, prima_anual: l.ic.prima_anual!.toFixed(2), dias, base_dias: l.regla?.base_dias ?? null,
              importe: l.valor.neg().toFixed(2), origen: "calculada", id_regla_prorrateo: l.regla?.id ?? null,
            },
          });
        }
        const obligacion = await crearObligacionEndoso(tx, periodo, en.id, en.numero, monto.neg(), f, vencimiento(fd, f), usuario.id, e.numero_aseguradora);
        await registrarGestion(
          usuario.id,
          MODULO,
          `PERÍODO ${periodo.id} | ENDOSO ${en.numero} BAJA de ${nombre} el ${f}: devolución ${monto.toFixed(2)} ${periodo.moneda}${e.importe_aseguradora ? " (importe de la aseguradora)" : ""}${obligacion}`,
          tx,
          { empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: f < hoyPlanta() ? "ENDOSO RETROACTIVO" : "ENDOSO", motivo: e.motivo },
        );
        return { ok: true, mensaje: `Endoso ${en.numero} confirmado: baja de ${nombre}, devolución ${formatearImporte(monto.toFixed(2))} ${periodo.moneda}.` };
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    if (error instanceof Bloqueo) return { error: error.message };
    console.error("[bajaPorEndoso]", error);
    return { error: "No se pudo registrar el endoso. Intenta de nuevo." };
  }
  if (simular || !resultado.ok) return resultado;
  revalidatePath("/finanzas/primas");
  revalidatePath(ruta(periodo.id));
  // El formulario de baja desaparece con el asegurado dado de baja: el aviso va arriba.
  redirect(`${ruta(periodo.id)}?hecho=${encodeURIComponent(resultado.mensaje ?? "")}`);
}

// ---------------------------------------------------------------- cambio de tomador, pagador…
export async function cambioPartePorEndoso(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const r = await periodoEditable(usuario, texto(fd, "id_periodo"), ["confirmado"]);
  if ("error" in r) return { error: r.error };
  const { periodo } = r;
  const entrada = parteSchema.safeParse({ rol: texto(fd, "rol"), id_parte: texto(fd, "id_parte") });
  const endoso = leerEndoso(fd);
  if (!entrada.success || !endoso.success) {
    return { error: "Revisa los campos marcados.", errores: { ...(entrada.success ? {} : erroresDeZod(entrada.error)), ...(endoso.success ? {} : erroresDeZod(endoso.error)) } };
  }
  const { rol, id_parte } = entrada.data;
  const f = endoso.data.fecha_efectiva;
  if (f < iso(periodo.vigencia_desde) || f >= iso(periodo.vigencia_hasta)) return { errores: { fecha_efectiva: "Debe estar dentro de la vigencia" } };
  const parte = await parteDeEmpresa(id_parte, periodo.empresa);
  if (!parte) return { errores: { id_parte: "Elige una persona o empresa activa de esta empresa" } };
  const vigente = await db.periodo_partes.findFirst({ where: { id_periodo: periodo.id, rol, hasta: null }, include: { partes: true } });
  if (vigente?.id_parte === id_parte) return { error: `Ya es el ${ROLES_PERIODO[rol].toLowerCase()} vigente.` };
  if (vigente && iso(vigente.desde) >= f) return { errores: { fecha_efectiva: `Debe ser posterior al ${iso(vigente.desde)}` } };

  try {
    await db.$transaction(async (tx) => {
      const en = await tx.endosos.create({
        data: {
          empresa: periodo.empresa, id_periodo: periodo.id, numero: await siguienteEndoso(tx, periodo.id), tipo: "cambio_parte", fecha_efectiva: fecha(f),
          numero_aseguradora: endoso.data.numero_aseguradora, retroactivo: f < hoyPlanta(),
          descripcion: `${ROLES_PERIODO[rol]}: ${nombreParte(parte)}${vigente ? ` (antes ${nombreParte(vigente.partes)})` : ""}`, motivo: endoso.data.motivo, creado_por: usuario.id,
        },
      });
      if (vigente) await tx.periodo_partes.update({ where: { id: vigente.id }, data: { hasta: fecha(f) } });
      await tx.periodo_partes.create({ data: { empresa: periodo.empresa, id_periodo: periodo.id, rol, id_parte, desde: fecha(f), id_endoso: en.id, creado_por: usuario.id } });
      await registrarGestion(usuario.id, MODULO, `PERÍODO ${periodo.id} | ENDOSO ${en.numero} ${ROLES_PERIODO[rol].toUpperCase()} desde ${f}: ${en.descripcion}`, tx, {
        empresa: periodo.empresa, entidad: "poliza_periodos", idRegistro: periodo.id, operacion: f < hoyPlanta() ? "ENDOSO RETROACTIVO" : "ENDOSO", motivo: endoso.data.motivo,
      });
    });
  } catch (error) {
    console.error("[cambioPartePorEndoso]", error);
    return { error: "No se pudo registrar el endoso. Intenta de nuevo." };
  }
  revalidatePath(ruta(periodo.id));
  return { ok: true, mensaje: "Cambio registrado por endoso; lo anterior queda en el historial." };
}

// ---------------------------------------------------------------- renovación anual
/**
 * Prepara la renovación: crea el período siguiente en preparación copiando partes vigentes, tarifas
 * (para revisarlas), asegurados elegibles con sus coberturas y beneficiarios, y valores del año
 * anterior. Los excluidos se muestran con su motivo en la pantalla del período nuevo.
 */
export async function prepararRenovacion(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const idTexto = texto(fd, "id_periodo");
  const anterior = /^\d+$/.test(idTexto)
    ? await db.poliza_periodos.findUnique({
        where: { id: BigInt(idTexto) },
        include: {
          polizas: { include: { ramos: { include: { coberturas: true } } } },
          periodo_partes: { where: { hasta: null } },
          periodo_tarifas: true,
          inclusiones: {
            include: {
              inclusion_coberturas: true,
              beneficiarios: { where: { hasta: null } },
              partes: { select: { tipo: true, nombres: true, apellidos: true, razon_social: true, estado: true } },
              vehiculos: { select: { placa: true, estado: true, fecha_baja: true, motivo_baja: true } },
              propiedades: { select: { nombre: true, estado: true, fecha_baja: true, motivo_baja: true } },
            },
          },
        },
      })
    : null;
  if (!anterior) return { error: "El período ya no existe." };
  const negado = sinPermiso(usuario, anterior.empresa, "seguros.registrar");
  if (negado) return { error: negado };
  if (anterior.estado !== "confirmado") return { error: "Solo se renueva un período confirmado." };
  if (anterior.polizas.estado !== "activa") return { error: "La póliza está cancelada." };
  const existente = await db.poliza_periodos.findFirst({ where: { id_periodo_anterior: anterior.id, estado: { not: "anulado" } } });
  if (existente) redirect(ruta(existente.id));

  const desde = iso(anterior.vigencia_hasta);
  const hasta = sumarAnios(desde);
  const coberturasActivas = new Set(anterior.polizas.ramos.coberturas.filter((c) => c.activo).map((c) => c.id));
  let idNuevo: bigint;
  try {
    idNuevo = await db.$transaction(
      async (tx) => {
        const ultimo = await tx.poliza_periodos.aggregate({ where: { id_poliza: anterior.id_poliza }, _max: { numero_periodo: true } });
        const nuevo = await tx.poliza_periodos.create({
          data: {
            empresa: anterior.empresa, id_poliza: anterior.id_poliza, numero_periodo: (ultimo._max.numero_periodo ?? 0) + 1, vigencia_desde: fecha(desde), vigencia_hasta: fecha(hasta),
            moneda: anterior.moneda, id_periodo_anterior: anterior.id, creado_por: usuario.id,
          },
        });
        for (const p of anterior.periodo_partes) {
          await tx.periodo_partes.create({ data: { empresa: anterior.empresa, id_periodo: nuevo.id, rol: p.rol, id_parte: p.id_parte, desde: fecha(desde), creado_por: usuario.id } });
        }
        for (const t of anterior.periodo_tarifas.filter((x) => coberturasActivas.has(x.id_cobertura))) {
          await tx.periodo_tarifas.create({ data: { empresa: anterior.empresa, id_periodo: nuevo.id, id_cobertura: t.id_cobertura, clase: t.clase, tasa: t.tasa, prima_fija: t.prima_fija, creado_por: usuario.id } });
        }
        const excluidos: string[] = [];
        let copiados = 0;
        for (const i of anterior.inclusiones) {
          const s = i.vehiculos ?? i.propiedades;
          const sujeto = {
            tipo: i.vehiculos ? ("vehiculo" as const) : i.propiedades ? ("propiedad" as const) : ("persona" as const),
            nombre: i.vehiculos?.placa ?? i.propiedades?.nombre ?? nombreParte(i.partes!),
            estado: s?.estado ?? i.partes!.estado,
            fecha_baja: s?.fecha_baja ? iso(s.fecha_baja) : null,
            motivo_baja: s?.motivo_baja ?? null,
          };
          const el = elegibleParaRenovar({ hasta: iso(i.hasta), baja_por_endoso: i.id_endoso_baja !== null }, iso(anterior.vigencia_hasta), sujeto, desde);
          if (!el.elegible) {
            excluidos.push(`${sujeto.nombre} (${el.motivo})`);
            continue;
          }
          const nueva = await tx.inclusiones.create({
            data: {
              empresa: i.empresa, id_periodo: nuevo.id, id_persona: i.id_persona, id_vehiculo: i.id_vehiculo, id_propiedad: i.id_propiedad, certificado: i.certificado, ceco: i.ceco,
              clase_tarifa: i.clase_tarifa, desde: fecha(desde), hasta: fecha(hasta), valor_bien: i.valor_bien, aditamentos: i.aditamentos, suma_asegurada: i.suma_asegurada,
              id_inclusion_anterior: i.id, observaciones: i.observaciones, creado_por: usuario.id,
            },
          });
          const coberturas = i.inclusion_coberturas.filter((c) => coberturasActivas.has(c.id_cobertura));
          if (coberturas.length) {
            await tx.inclusion_coberturas.createMany({
              data: coberturas.map((c) => ({ empresa: i.empresa, id_inclusion: nueva.id, id_cobertura: c.id_cobertura, suma_asegurada: c.suma_asegurada, creado_por: usuario.id })),
            });
          }
          for (const b of i.beneficiarios) {
            await tx.beneficiarios.create({ data: { empresa: i.empresa, id_inclusion: nueva.id, id_parte: b.id_parte, parentesco: b.parentesco, porcentaje: b.porcentaje, desde: fecha(desde), creado_por: usuario.id } });
          }
          copiados++;
        }
        await recalcularPeriodo(tx, nuevo.id, usuario.id);
        await registrarGestion(
          usuario.id,
          MODULO,
          `PERÍODO ${nuevo.id} | RENOVACIÓN EN PREPARACIÓN del período ${anterior.id}: ${desde} a ${hasta} · ${copiados} asegurados copiados${excluidos.length ? ` · excluidos: ${excluidos.join("; ")}` : ""}`,
          tx,
          { empresa: anterior.empresa, entidad: "poliza_periodos", idRegistro: nuevo.id, operacion: "RENOVACION" },
        );
        return nuevo.id;
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    if (codigoPg(error) === "23P01" || codigoPg(error) === "23505") return { error: "Ya hay otro período en esas fechas para esta póliza." };
    console.error("[prepararRenovacion]", error);
    return { error: "No se pudo preparar la renovación. Intenta de nuevo." };
  }
  revalidatePath("/polizas/renovaciones");
  redirect(`${ruta(idNuevo)}?renovacion=1`);
}
