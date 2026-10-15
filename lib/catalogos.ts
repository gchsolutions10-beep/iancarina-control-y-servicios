/** Listas configurables de cys.catalogo_valores (nombre visible y para qué sirven). */
export const LISTAS = {
  tipo_identificacion: { titulo: "Tipos de identificación", detalle: "V, E, P, J, G…" },
  funcion_organizacion: { titulo: "Funciones de organizaciones", detalle: "Aseguradora, taller, transportista…" },
  tipo_vehiculo: { titulo: "Tipos de vehículo", detalle: "Automóvil, camión, chuto…" },
  color: { titulo: "Colores", detalle: "Colores de vehículos" },
  clasificacion_chuto: { titulo: "Clasificación de chuto", detalle: "Por confirmar con el cliente" },
  tipo_inmueble: { titulo: "Tipos de inmueble", detalle: "Casa, edificio, galpón…" },
  tipo_documento: { titulo: "Tipos de documento", detalle: "Para clasificar documentos adjuntos" },
} as const;

export type Lista = keyof typeof LISTAS;
export const esLista = (v: string): v is Lista => Object.hasOwn(LISTAS, v);
