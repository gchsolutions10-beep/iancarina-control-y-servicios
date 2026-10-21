/**
 * Reglas puras de la consolidación de personas duplicadas (probadas en tests/fusion.test.ts).
 * La fusión misma se hace en la base: cys.fusionar_partes / cys.revertir_fusion (migración 007).
 */

/** Qué se mueve de una ficha a otra, en palabras del usuario (mismas tablas que cys.columnas_parte()). */
export const REFERENCIAS_PARTE: Record<string, string> = {
  titularidades: "Titularidades de vehículos y propiedades",
  documentos: "Documentos",
  polizas: "Pólizas como aseguradora",
  periodo_partes: "Tomador, pagador o corredor de pólizas",
  inclusiones: "Asegurado en pólizas",
  beneficiarios: "Beneficiario",
  reglas_calculo: "Reglas de cálculo de la aseguradora",
  obligaciones: "Primas por pagar y cuentas por cobrar",
  pagos: "Pagos y cobros",
  siniestro_afectados: "Afectado en siniestros",
  siniestro_transporte: "Transportista en siniestros",
};

/** Columna que apunta a la parte en cada tabla (igual que cys.columnas_parte() en la migración 007). */
export const COLUMNAS_PARTE: Record<keyof typeof REFERENCIAS_PARTE, string> = {
  titularidades: "id_parte",
  documentos: "id_parte",
  polizas: "id_aseguradora",
  periodo_partes: "id_parte",
  inclusiones: "id_persona",
  beneficiarios: "id_parte",
  reglas_calculo: "id_aseguradora",
  obligaciones: "id_contraparte",
  pagos: "id_contraparte",
  siniestro_afectados: "id_persona",
  siniestro_transporte: "id_transportista",
};

/** Un par de fichas siempre con el menor id primero (así se guarda «no son la misma persona»). */
export function ordenarPar(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

/** Solo dígitos de una identificación: V-12.345.678 y E-12345678 comparten número. */
export const soloDigitos = (v: string) => v.replace(/\D/g, "");

/** Campos que el destino toma del origen cuando no los tiene. */
export const CAMPOS_COMPLETABLES = ["fecha_nacimiento", "telefono", "correo", "direccion"] as const;

export function camposACompletar(destino: Record<string, unknown>, origen: Record<string, unknown>): string[] {
  const vacio = (v: unknown) => v === null || v === undefined || v === "";
  return CAMPOS_COMPLETABLES.filter((c) => vacio(destino[c]) && !vacio(origen[c]));
}

/** Mensaje claro para los errores de la base al fusionar o revertir (las condiciones se revisan antes). */
export function mensajeErrorFusion(codigo: string | null): string {
  if (codigo === "23P01") return "Las dos fichas están en la misma póliza (o como beneficiarias del mismo asegurado) con fechas que se cruzan. Dé de baja una por endoso antes de fusionar.";
  if (codigo === "23505") return "Ya existe otra ficha activa con la identificación de la ficha original: no se puede revertir sin repetirla.";
  if (codigo === "23514") return "Las fichas cambiaron mientras tanto. Recargue la página y revise de nuevo.";
  return "No se pudo completar la operación. Intente de nuevo.";
}
