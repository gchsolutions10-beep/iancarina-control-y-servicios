"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { RotateCcw, Route } from "lucide-react";
import { reiniciarRecorridos } from "@/actions/recorridos";
import { claseBoton } from "@/components/ui/boton";

/** Manual → Recorridos guiados: ver de nuevo la bienvenida o volver a mostrar todos los recorridos. */
export function RecorridosManual() {
  const [hecho, setHecho] = useState(false);
  const [pendiente, iniciar] = useTransition();
  return (
    <section id="recorridos" data-recorrido="recorridos-manual" className="scroll-mt-24 rounded-xl border border-borde bg-superficie p-6 shadow-xs">
      <h2 className="text-lg font-semibold text-tinta">Recorridos guiados</h2>
      <p className="mt-1 text-sm text-tinta-suave">
        La primera vez que entra a cada pantalla, un paso a paso le muestra sus partes. Puede saltarlo con «Saltar» o Esc, y repetirlo cuando quiera con el botón «i» de la pantalla → «Ver el recorrido de esta pantalla».
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href="/inicio?recorrido=1" className={claseBoton("secundario", "md")}>
          <Route className="size-4" aria-hidden /> Ver la bienvenida
        </Link>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => iniciar(async () => {
            await reiniciarRecorridos();
            setHecho(true);
          })}
          className={claseBoton("secundario", "md")}
        >
          <RotateCcw className="size-4" aria-hidden /> Volver a mostrar los recorridos y los primeros pasos
        </button>
        <span aria-live="polite" className="text-sm text-exito">
          {hecho && "Listo: cada recorrido se abrirá de nuevo al entrar a su pantalla, y los primeros pasos vuelven a Inicio."}
        </span>
      </div>
    </section>
  );
}
