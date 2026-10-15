"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { BotonVolver } from "./boton-volver";

export type EnlaceNavegacion = { href: string; etiqueta: string };

export function Navegacion({ enlaces }: { enlaces: EnlaceNavegacion[] }) {
  const ruta = usePathname();

  return (
    <nav aria-label="Secciones del sistema" className="-mb-px flex gap-1 overflow-x-auto">
      {enlaces.map(({ href, etiqueta }) => {
        const activo = ruta === href || ruta.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
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
