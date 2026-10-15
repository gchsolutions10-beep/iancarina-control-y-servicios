const entero = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 });
const decimal1 = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const porcentaje = new Intl.NumberFormat("es-VE", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

export const formatearEntero = (valor: number) => entero.format(valor);

/** Kilogramos en toneladas con un decimal: 232760 → "232,8 t". */
export const formatearToneladas = (kg: number) => `${decimal1.format(kg / 1000)} t`;

export const formatearVariacion = (actual: number, anterior: number) =>
  anterior > 0 ? porcentaje.format((actual - anterior) / anterior) : null;

export const formatearFechaCorta = (fecha: Date) =>
  fecha.toLocaleDateString("es-VE", { day: "2-digit", month: "short", timeZone: "UTC" });

export const formatearFechaLarga = (fecha: Date) =>
  fecha.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
