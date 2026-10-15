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


/**
 * Importe con 2 decimales y separadores de Venezuela, desde el texto decimal exacto de la base
 * ("1234.5" → "1.234,50"). Agrega la moneda si se indica. null → "—".
 */
export function formatearImporte(valor: string | null | undefined, moneda?: string) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const [entero, decimales = ""] = valor.replace("-", "").split(".");
  const texto = `${valor.startsWith("-") ? "−" : ""}${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimales.padEnd(2, "0").slice(0, 2)}`;
  return moneda ? `${texto} ${moneda}` : texto;
}

/** Tasa o porcentaje con coma decimal, sin ceros de más ("2.50000000" → "2,5"). */
export function formatearTasa(valor: string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "—";
  return valor.includes(".") ? valor.replace(/\.?0+$/, "").replace(".", ",") : valor;
}

/** Variación como porcentaje con signo (0.1 → "+10,0 %"). */
export const formatearPorcentaje = (fraccion: number) => porcentaje.format(fraccion);
