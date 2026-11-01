"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { marcarRecorridoVisto } from "@/actions/recorridos";
import { claseBoton } from "@/components/ui/boton";
import type { PrimerPaso } from "@/lib/ayuda/primeros-pasos";
import { cn } from "@/lib/cn";

/** Lista de tareas para empezar (Inicio). Se oculta con «Ya sé usarlo» y vuelve desde el Manual. */
export function PrimerosPasos({ pasos }: { pasos: PrimerPaso[] }) {
  const [oculto, setOculto] = useState(false);
  const [, iniciar] = useTransition();
  if (oculto) return null;
  const conEstado = pasos.filter((p) => p.hecho !== null);
  const listos = conEstado.filter((p) => p.hecho).length;
  const siguiente = pasos.find((p) => p.hecho === false);

  return (
    <section data-recorrido="primeros-pasos" aria-labelledby="primeros-pasos" className="mb-10 rounded-2xl border border-borde bg-superficie p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="primeros-pasos" className="text-lg font-semibold text-tinta">Primeros pasos</h2>
          <p className="mt-0.5 text-sm text-tinta-suave">
            Siga estas tareas en orden. Cada una se marca sola al hacerla, y «Hacer ahora» lo lleva a la pantalla con su explicación paso a paso.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOculto(true);
            iniciar(() => marcarRecorridoVisto("primeros-pasos"));
          }}
          className="text-sm text-tinta-suave hover:text-tinta hover:underline"
        >
          Ya sé usarlo, ocultar
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3" aria-label={`${listos} de ${conEstado.length} tareas hechas`}>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-superficie-2">
          <div className="h-full rounded-full bg-exito transition-all duration-500 ease-suave" style={{ width: `${(listos / Math.max(1, conEstado.length)) * 100}%` }} />
        </div>
        <span className="text-sm text-tinta-suave tabular-nums">
          {listos} de {conEstado.length}
        </span>
      </div>

      <ol className="mt-4 divide-y divide-borde">
        {pasos.map((p, i) => {
          const actual = p === siguiente;
          return (
            <li key={p.id} className={cn("flex flex-wrap items-center gap-3 py-3", actual && "-mx-3 rounded-xl bg-marca-50 px-3 dark:bg-marca-950/30")}>
              {p.hecho ? (
                <CircleCheck className="size-6 shrink-0 text-exito" aria-label="Hecho" />
              ) : (
                <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums", actual ? "border-marca-600 bg-marca-600 text-white" : "border-borde-fuerte text-tinta-suave")}>
                  {i + 1}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", p.hecho ? "text-tinta-suave line-through decoration-tinta-tenue" : "text-tinta")}>{p.titulo}</p>
                <p className="text-xs text-tinta-suave">{p.texto}</p>
              </div>
              <Link href={p.enlace} className={claseBoton(actual ? "primario" : "secundario", "sm")}>
                {p.hecho ? "Ver" : "Hacer ahora"}
                {actual && <ArrowRight className="size-3.5" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
