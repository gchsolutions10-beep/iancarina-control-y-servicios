import { claseControl } from "@/components/ui/campo";
import { cn } from "@/lib/cn";

/** Lista desplegable de un filtro: «Todos» = sin filtro. Muestra cuántos hay si se indica. */
export function SelectFiltro({ nombre, etiqueta, valor, opciones, todos = "Todos", className }: {
  nombre: string;
  etiqueta: string;
  valor: string | number | null;
  opciones: { valor: string; etiqueta?: string; n?: number }[];
  todos?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs font-medium text-tinta-suave">{etiqueta}</span>
      <select name={nombre} defaultValue={valor ?? ""} className={claseControl}>
        <option value="">{todos}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta ?? o.valor}
            {o.n ? ` (${o.n})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextoFiltro({ nombre, etiqueta, valor, tipo = "text", placeholder, className }: {
  nombre: string;
  etiqueta: string;
  valor: string | null;
  tipo?: "text" | "date" | "search";
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs font-medium text-tinta-suave">{etiqueta}</span>
      <input type={tipo} name={nombre} defaultValue={valor ?? ""} placeholder={placeholder} className={claseControl} />
    </label>
  );
}
