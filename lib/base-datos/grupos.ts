/**
 * Grupos de datos que el administrador puede limpiar (Base de datos → Limpiar). Lógica pura,
 * probada en tests/base-datos.test.ts. El orden de los pasos respeta las llaves foráneas: primero
 * lo que depende de otra cosa.
 *
 * Nunca se limpian: empresas, usuarios, roles, permisos, ajustes, catálogos de configuración, reglas
 * generales de cálculo ni la bitácora (es inmutable: la limpieza misma queda registrada en ella).
 */

export type Paso = {
  tabla: string;
  /** Condición extra además de la empresa (SQL fijo, nunca texto del usuario). */
  donde?: string;
  /** La tabla tiene disparadores de protección que se suspenden solo durante la limpieza. */
  protegida?: boolean;
};

export const GRUPOS = {
  finanzas: {
    titulo: "Pagos y obligaciones",
    detalle: "Primas por pagar, devoluciones por cobrar, pagos e imputaciones.",
    requiere: [],
    pasos: [
      { tabla: "imputaciones", protegida: true },
      { tabla: "pagos", protegida: true },
      { tabla: "obligacion_movimientos", protegida: true },
      { tabla: "obligaciones" },
    ],
  },
  polizas: {
    titulo: "Pólizas",
    detalle: "Pólizas, vigencias, asegurados, coberturas, tarifas, endosos, cálculos, beneficiarios, documentos de pólizas y reglas de cálculo propias de la empresa.",
    // Al limpiar pólizas se limpian también sus pagos y obligaciones (dependen de ellas).
    requiere: ["finanzas"],
    pasos: [
      { tabla: "endoso_lineas", protegida: true },
      { tabla: "beneficiarios", protegida: true },
      { tabla: "inclusion_coberturas", protegida: true },
      { tabla: "inclusiones", protegida: true },
      { tabla: "calculos" },
      { tabla: "periodo_tarifas", protegida: true },
      { tabla: "periodo_partes", protegida: true },
      { tabla: "endosos" },
      { tabla: "poliza_periodos", protegida: true },
      { tabla: "documentos", donde: "id_poliza IS NOT NULL" },
      { tabla: "reglas_calculo", protegida: true },
      { tabla: "polizas" },
    ],
  },
  activos: {
    titulo: "Vehículos y propiedades",
    detalle: "Fichas de vehículos y propiedades, sus titulares, fotos y documentos.",
    requiere: ["polizas"],
    pasos: [
      { tabla: "titularidades" },
      { tabla: "documentos", donde: "(id_vehiculo IS NOT NULL OR id_propiedad IS NOT NULL)" },
      { tabla: "vehiculos" },
      { tabla: "propiedades" },
    ],
  },
  personas: {
    titulo: "Personas y organizaciones",
    detalle: "Fichas de personas, aseguradoras, talleres y demás organizaciones, con sus documentos.",
    requiere: ["activos"],
    pasos: [
      { tabla: "documentos", donde: "id_parte IS NOT NULL" },
      { tabla: "partes" },
    ],
  },
} as const satisfies Record<string, { titulo: string; detalle: string; requiere: readonly string[]; pasos: readonly Paso[] }>;

export type Grupo = keyof typeof GRUPOS;
export const ORDEN: Grupo[] = ["finanzas", "polizas", "activos", "personas"];
export const esGrupo = (v: string): v is Grupo => Object.hasOwn(GRUPOS, v);

/** Grupos elegidos más los que dependen de ellos (limpiar personas obliga a limpiar sus pólizas…). */
export function resolverGrupos(elegidos: string[]): Grupo[] {
  const final = new Set<Grupo>();
  const agregar = (g: Grupo) => {
    if (final.has(g)) return;
    final.add(g);
    for (const r of GRUPOS[g].requiere as readonly Grupo[]) agregar(r);
  };
  for (const g of elegidos) if (esGrupo(g)) agregar(g);
  // Siempre en el orden que respeta las llaves: lo que depende primero.
  return ORDEN.filter((g) => final.has(g));
}

/** Pasos en orden de ejecución para los grupos resueltos. */
export const pasosDe = (grupos: Grupo[]): Paso[] => grupos.flatMap((g) => [...GRUPOS[g].pasos]);

/** Texto que el administrador debe escribir para confirmar. */
export const CONFIRMACION = "LIMPIAR";
