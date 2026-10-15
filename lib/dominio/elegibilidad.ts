/**
 * Elegibilidad de un asegurado para la renovación (lógica pura; propuesta base
 * docs/REGLAS-Y-PENDIENTES.md §2, pregunta 9 por confirmar):
 * - Se excluye el vehículo o la propiedad con fecha de venta o baja anterior al inicio de la nueva vigencia.
 * - Se excluye la persona cuya ficha ya no está activa.
 * - Se excluye lo que salió del período anterior por endoso de baja.
 */

export type SujetoRenovacion = {
  tipo: "vehiculo" | "persona" | "propiedad";
  nombre: string;
  /** Estado de la ficha: activo/activa, vendido, retirado, inactiva, fusionada… */
  estado: string;
  fecha_baja: string | null;
  motivo_baja: string | null;
};

export type Elegibilidad = { elegible: true } | { elegible: false; motivo: string };

export function elegibleParaRenovar(
  inclusion: { hasta: string; baja_por_endoso: boolean },
  periodoAnteriorHasta: string,
  sujeto: SujetoRenovacion,
  nuevoDesde: string,
): Elegibilidad {
  if (inclusion.baja_por_endoso || inclusion.hasta < periodoAnteriorHasta) {
    return { elegible: false, motivo: `Salió del período anterior por endoso de baja (${inclusion.hasta})` };
  }
  if (sujeto.tipo === "persona") {
    if (sujeto.estado !== "activa") return { elegible: false, motivo: `La ficha de la persona está ${sujeto.estado}` };
    return { elegible: true };
  }
  if (sujeto.fecha_baja && sujeto.fecha_baja < nuevoDesde) {
    const motivo = sujeto.motivo_baja === "venta" ? "Vendido" : sujeto.motivo_baja === "transferencia" ? "Transferido" : "Retirado";
    return { elegible: false, motivo: `${motivo} el ${sujeto.fecha_baja}, antes del inicio de la nueva vigencia` };
  }
  return { elegible: true };
}
