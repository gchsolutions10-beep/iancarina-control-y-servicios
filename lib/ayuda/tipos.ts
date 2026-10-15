/** Guía de uso de un módulo: la muestra el botón «i» y forma el manual del usuario por rol. */
export type Guia = {
  /** Mismo id que el módulo en lib/modulos.ts (así el manual se filtra por permisos). */
  id: string;
  titulo: string;
  /** Quién lo usa, en palabras de planta. */
  quien: string;
  /** Para qué sirve, en una o dos frases. */
  para: string;
  /** Cómo llenarlo, en orden. */
  pasos: string[];
  /** Qué tener en cuenta (reglas, cálculos automáticos, avisos). */
  tener: string[];
  /** Qué no hacer. */
  evitar: string[];
};
