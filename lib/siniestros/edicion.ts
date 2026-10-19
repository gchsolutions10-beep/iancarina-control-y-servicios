import "server-only";
import { tienePermiso, type UsuarioActual } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { sinPermiso } from "@/lib/fichas/acceso";
import { nombreParte } from "@/lib/validations/fichas";

/** Auxiliares de las acciones de siniestros (fuera de "use server": no son acciones). */

/**
 * Expediente con el permiso de registrar verificado en su empresa. Los confidenciales (personas)
 * exigen además «Ver datos personales». `abierto`: la operación solo vale con el expediente abierto.
 */
export async function siniestroEditable(usuario: UsuarioActual, idTexto: string, opciones: { abierto?: boolean } = {}) {
  const id = /^\d+$/.test(idTexto) ? BigInt(idTexto) : null;
  const s = id ? await db.siniestros.findUnique({ where: { id }, include: { tipos_siniestro: true } }) : null;
  if (!s) return { error: "El expediente ya no existe." } as const;
  const negado = sinPermiso(usuario, s.empresa, "seguros.registrar");
  if (negado) return { error: negado } as const;
  if (s.confidencial && !tienePermiso(usuario, "personas.datos_sensibles", s.empresa)) return { error: "Expediente confidencial: hace falta el permiso «Ver datos personales»." } as const;
  if (s.estado === "anulado") return { error: "El expediente está anulado." } as const;
  if (opciones.abierto && s.estado !== "abierto") return { error: "El expediente está cerrado. Reábrelo para cambiar sus etapas o afectados." } as const;
  return { siniestro: s } as const;
}

/** Ficha afectada de la misma empresa (puede estar dada de baja: el evento pudo ser anterior). */
export async function afectadoValido(sujeto: string, id: bigint, empresa: string) {
  if (sujeto === "vehiculo") {
    const v = await db.vehiculos.findUnique({ where: { id }, select: { empresa: true, placa: true } });
    return v?.empresa === empresa ? { columna: "id_vehiculo" as const, id, nombre: v.placa } : null;
  }
  if (sujeto === "propiedad") {
    const p = await db.propiedades.findUnique({ where: { id }, select: { empresa: true, nombre: true } });
    return p?.empresa === empresa ? { columna: "id_propiedad" as const, id, nombre: p.nombre } : null;
  }
  if (sujeto === "persona") {
    const p = await db.partes.findUnique({ where: { id }, select: { empresa: true, tipo: true, estado: true, nombres: true, apellidos: true, razon_social: true } });
    return p?.empresa === empresa && p.tipo === "natural" && p.estado !== "fusionada" ? { columna: "id_persona" as const, id, nombre: nombreParte(p) } : null;
  }
  return null;
}

/**
 * Verifica el vínculo explícito con una póliza: la inclusión es de ese mismo sujeto, su período está
 * confirmado, cubría la fecha del evento y tiene esa cobertura. Devuelve el período.
 */
export async function coberturaValida(c: { id_inclusion: bigint; id_cobertura: number }, afectado: { columna: "id_vehiculo" | "id_persona" | "id_propiedad"; id: bigint }, fechaEvento: string, empresa: string) {
  const f = new Date(`${fechaEvento}T00:00:00Z`);
  const inc = await db.inclusiones.findUnique({ where: { id: c.id_inclusion }, include: { poliza_periodos: { select: { estado: true } }, inclusion_coberturas: { select: { id_cobertura: true } } } });
  if (!inc || inc.empresa !== empresa || inc[afectado.columna] !== afectado.id) return null;
  if (inc.poliza_periodos.estado !== "confirmado" || inc.desde > f || inc.hasta <= f) return null;
  if (!inc.inclusion_coberturas.some((x) => x.id_cobertura === c.id_cobertura)) return null;
  return { ...c, id_periodo: inc.id_periodo };
}
