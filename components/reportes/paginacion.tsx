import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { claseBoton } from "@/components/ui/boton";
import { formatearEntero } from "@/lib/formato";

/** «Mostrando 51–100 de 340» con anterior/siguiente. `enlace(n)` arma la URL de la página n. */
export function Paginacion({ pagina, porPagina, total, enlace }: { pagina: number; porPagina: number; total: number; enlace: (n: number) => string }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);
  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <p className="text-sm text-tinta-suave tabular-nums">
        {total === 0 ? "Sin resultados" : `Mostrando ${formatearEntero(desde)}–${formatearEntero(hasta)} de ${formatearEntero(total)}`}
      </p>
      {paginas > 1 && (
        <div className="flex items-center gap-2">
          {pagina > 1 ? (
            <Link href={enlace(pagina - 1)} className={claseBoton("secundario", "md")} rel="prev">
              <ChevronLeft className="size-4" aria-hidden />
              Anterior
            </Link>
          ) : (
            <span className={claseBoton("secundario", "md", "pointer-events-none opacity-50")} aria-disabled="true">
              <ChevronLeft className="size-4" aria-hidden />
              Anterior
            </span>
          )}
          <span className="px-1 text-sm text-tinta-suave tabular-nums">
            {pagina} / {paginas}
          </span>
          {pagina < paginas ? (
            <Link href={enlace(pagina + 1)} className={claseBoton("secundario", "md")} rel="next">
              Siguiente
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span className={claseBoton("secundario", "md", "pointer-events-none opacity-50")} aria-disabled="true">
              Siguiente
              <ChevronRight className="size-4" aria-hidden />
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
