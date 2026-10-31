import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Area, Modulo } from "@/lib/modulos";

/** Secciones de una empresa con las tarjetas de sus módulos (Inicio y pestaña de la empresa). */
export function SeccionesArea({ area, className }: { area: Area; className?: string }) {
  return (
    <div data-recorrido="modulos" className={cn("flex flex-col gap-8", className)}>
      {area.secciones.map((seccion) => (
        <div key={seccion.nombre}>
          <h3 className="mb-3 text-xs font-medium tracking-wide text-tinta-tenue uppercase">{seccion.nombre}</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {seccion.modulos.map((modulo) => (
              <li key={modulo.id}>
                <TarjetaModulo modulo={modulo} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TarjetaModulo({ modulo }: { modulo: Modulo }) {
  const { icono: Icono, ruta } = modulo;
  const contenido = (
    <>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg border border-borde",
          ruta ? "bg-marca-50 text-marca-600 dark:bg-marca-950/40" : "bg-superficie-2 text-tinta-tenue",
        )}
      >
        <Icono className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-pretty text-tinta">{modulo.nombre}</span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-tinta-suave">{modulo.descripcion}</span>
        {!ruta && (
          <span className="mt-2 inline-block rounded-full bg-superficie-2 px-2 py-0.5 text-[11px] font-medium text-tinta-tenue">
            Próximamente
          </span>
        )}
      </span>
      {ruta && (
        <ChevronRight
          className="size-4 shrink-0 self-center text-tinta-tenue transition-transform duration-150 ease-suave group-hover:translate-x-0.5"
          aria-hidden
        />
      )}
    </>
  );

  const clase = "flex h-full gap-3 rounded-xl border border-borde bg-superficie p-4 shadow-xs";

  if (!ruta) {
    return (
      <div className={cn(clase, "opacity-75")} aria-disabled="true">
        {contenido}
      </div>
    );
  }

  return (
    <Link
      href={ruta}
      className={cn(
        clase,
        "group transition-[border-color,box-shadow,transform] duration-150 ease-suave hover:border-borde-fuerte hover:shadow-sm active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40",
      )}
    >
      {contenido}
    </Link>
  );
}
