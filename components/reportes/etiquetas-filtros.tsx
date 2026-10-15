import Link from "next/link";
import { X } from "lucide-react";

type Etiqueta = { clave: string; etiqueta: string; valor: string; quitar: string };

/** Filtros aplicados como etiquetas: cada una se quita con un clic. */
export function EtiquetasFiltros({ etiquetas, limpiar }: { etiquetas: Etiqueta[]; limpiar: string }) {
  if (etiquetas.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Filtros aplicados">
      {etiquetas.map((e) => (
        <Link
          key={e.clave}
          href={e.quitar}
          aria-label={`Quitar filtro ${e.etiqueta}: ${e.valor}`}
          className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-borde bg-superficie py-1 pr-2 pl-3 text-xs shadow-xs transition-colors duration-150 ease-suave hover:border-borde-fuerte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40"
        >
          <span className="text-tinta-tenue">{e.etiqueta}:</span>
          <span className="truncate font-medium text-tinta">{e.valor}</span>
          <X className="size-3.5 shrink-0 text-tinta-tenue group-hover:text-tinta" aria-hidden />
        </Link>
      ))}
      <Link href={limpiar} className="rounded-md px-2 py-1 text-xs font-medium text-marca-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40 dark:text-marca-400">
        Limpiar filtros
      </Link>
    </div>
  );
}
