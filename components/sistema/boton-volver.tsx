"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * «Volver» a la pantalla anterior sin pasar por Inicio, con los filtros que tenía. Lleva la
 * pila de pantallas de la web en esta pestaña: si se entró directo (enlace o recarga) no hay
 * anterior y va a Inicio. Inicio recuerda dónde estaba (RecordarDesplazamiento).
 */
export function BotonVolver() {
  const ruta = usePathname();
  const router = useRouter();
  // Una entrada por pantalla (ruta); los cambios de filtros (?fecha=…) actualizan la misma.
  const pila = useRef<{ ruta: string; url: string }[]>([]);

  useEffect(() => {
    const p = pila.current;
    const url = `${window.location.pathname}${window.location.search}`;
    if (p.at(-1)?.ruta === ruta) {
      p[p.length - 1].url = url;
      return;
    }
    if (p.at(-2)?.ruta === ruta) p.pop(); // volvió (botón o atrás del navegador)
    else p.push({ ruta, url });
  });

  if (ruta === "/inicio") return null;

  return (
    <button
      type="button"
      onClick={() => router.push(pila.current.at(-2)?.url ?? "/inicio")}
      className={cn(
        "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-3 text-sm text-tinta-suave transition-colors duration-150 ease-suave",
        "hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-marca-600/40",
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      Volver
    </button>
  );
}
