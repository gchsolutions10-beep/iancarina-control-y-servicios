"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { slugRecorrido } from "@/lib/ayuda/recorridos";
import { cn } from "@/lib/cn";
import { BotonVolver } from "./boton-volver";

export type EnlaceNavegacion = {
  href: string;
  etiqueta: string;
  /** Otras rutas en las que la pestaña se marca activa (las pantallas que agrupa). */
  activoEn?: string[];
};

const dentro = (ruta: string, base: string) => ruta === base || ruta.startsWith(`${base}/`);

export function Navegacion({ enlaces }: { enlaces: EnlaceNavegacion[] }) {
  const ruta = usePathname();

  return (
    <nav data-recorrido="menu" aria-label="Secciones del sistema" className="-mb-px flex gap-1 overflow-x-auto">
      {enlaces.map(({ href, etiqueta, activoEn }) => {
        const activo = [href, ...(activoEn ?? [])].some((b) => dentro(ruta, b));
        return (
          <Link
            key={href}
            href={href}
            data-recorrido={`menu-${slugRecorrido(etiqueta)}`}
            aria-current={activo ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-3 text-sm transition-colors duration-150 ease-suave",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-marca-600/40",
              activo
                ? "border-marca-600 font-medium text-tinta"
                : "border-transparent text-tinta-suave hover:border-borde-fuerte hover:text-tinta",
            )}
          >
            {etiqueta}
          </Link>
        );
      })}
      <BotonVolver />
    </nav>
  );
}
