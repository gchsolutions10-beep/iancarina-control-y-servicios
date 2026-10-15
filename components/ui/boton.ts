import { cn } from "@/lib/cn";

type Variante = "primario" | "secundario" | "fantasma";
type Medida = "sm" | "md" | "lg" | "icono";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium select-none " +
  "transition-[background-color,color,box-shadow,transform] duration-150 ease-suave " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40 focus-visible:ring-offset-2 focus-visible:ring-offset-fondo " +
  "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 " +
  "disabled:pointer-events-none disabled:opacity-50";

const variantes: Record<Variante, string> = {
  primario: "bg-marca-600 text-white shadow-xs hover:bg-marca-700",
  secundario: "border border-borde-fuerte bg-superficie text-tinta shadow-xs hover:bg-superficie-2",
  fantasma: "text-tinta-suave hover:bg-superficie-2 hover:text-tinta",
};

const medidas: Record<Medida, string> = {
  sm: "h-8 px-2.5 text-xs",
  icono: "size-9 text-sm",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-[15px]",
};

/** Clases de botón, para usar en <button> o <Link>. */
export function claseBoton(variante: Variante = "primario", medida: Medida = "md", extra?: string) {
  return cn(base, variantes[variante], medidas[medida], extra);
}
