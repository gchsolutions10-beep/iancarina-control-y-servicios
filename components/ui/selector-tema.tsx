"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { COOKIE_TEMA, TEMAS, type Tema } from "@/lib/tema";

const OPCIONES: Record<Tema, { etiqueta: string; Icono: typeof Sun }> = {
  sistema: { etiqueta: "Tema del sistema", Icono: Monitor },
  claro: { etiqueta: "Tema claro", Icono: Sun },
  oscuro: { etiqueta: "Tema oscuro", Icono: Moon },
};

/** Alterna sistema → claro → oscuro. Se aplica al instante y se recuerda en este navegador. */
export function SelectorTema({ inicial, className }: { inicial: Tema; className?: string }) {
  const [tema, setTema] = useState<Tema>(inicial);
  const siguiente = TEMAS[(TEMAS.indexOf(tema) + 1) % TEMAS.length];
  const { Icono, etiqueta } = OPCIONES[tema];

  function cambiar() {
    setTema(siguiente);
    if (siguiente === "sistema") delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = siguiente;
    document.cookie = `${COOKIE_TEMA}=${siguiente}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={cambiar}
      aria-label={`${etiqueta}. Cambiar a ${OPCIONES[siguiente].etiqueta.toLowerCase()}`}
      title={`${etiqueta} · clic para cambiar`}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-tinta-suave transition-colors duration-150 ease-suave",
        "hover:bg-superficie-2 hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40",
        className,
      )}
    >
      <Icono className="size-4" aria-hidden />
    </button>
  );
}
