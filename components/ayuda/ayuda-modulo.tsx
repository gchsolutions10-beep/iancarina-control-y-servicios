"use client";

import { useRef } from "react";
import { Info, X } from "lucide-react";
import { claseBoton } from "@/components/ui/boton";
import type { Guia } from "@/lib/ayuda/tipos";

function Lista({ titulo, items, tono }: { titulo: string; items: string[]; tono?: "evitar" }) {
  if (!items.length) return null;
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold text-tinta">{titulo}</h3>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-tinta-suave">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            <span aria-hidden className={tono === "evitar" ? "mt-0.5 shrink-0 font-semibold text-error" : "mt-2 size-1.5 shrink-0 rounded-full bg-tinta-tenue"}>
              {tono === "evitar" ? "✕" : ""}
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Contenido de una guía (se usa en el diálogo del módulo y en el manual). */
export function ContenidoGuia({ guia }: { guia: Guia }) {
  return (
    <>
      <p className="text-sm text-tinta-suave">{guia.para}</p>
      <p className="mt-2 text-xs text-tinta-tenue">Lo usa: {guia.quien}</p>
      <section className="mt-5">
        <h3 className="text-sm font-semibold text-tinta">Cómo llenarlo</h3>
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-tinta-suave marker:text-tinta-tenue">
          {guia.pasos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </section>
      <Lista titulo="Tenga en cuenta" items={guia.tener} />
      <Lista titulo="No haga" items={guia.evitar} tono="evitar" />
    </>
  );
}

/** Botón «i» del encabezado de cada módulo: abre la guía de uso de ese formulario. */
export function AyudaModulo({ guia }: { guia: Guia }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        aria-label={`Guía de uso: ${guia.titulo}`}
        title="Guía de uso"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-borde bg-superficie text-tinta-suave shadow-xs transition-colors duration-150 ease-suave hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40"
      >
        <Info className="size-4" aria-hidden />
      </button>
      <dialog
        ref={dialogo}
        aria-labelledby={`guia-${guia.id}`}
        onClick={(e) => e.target === dialogo.current && dialogo.current?.close()}
        className="m-auto max-h-[85vh] w-[min(640px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-borde bg-superficie p-6 text-tinta shadow-xl backdrop:bg-black/40 open:animate-entrada"
      >
        <header className="flex items-start justify-between gap-4">
          <h2 id={`guia-${guia.id}`} className="text-lg font-semibold">
            {guia.titulo}
          </h2>
          <button type="button" onClick={() => dialogo.current?.close()} aria-label="Cerrar" className="rounded-md p-1 text-tinta-tenue hover:text-tinta">
            <X className="size-5" aria-hidden />
          </button>
        </header>
        <div className="mt-3">
          <ContenidoGuia guia={guia} />
        </div>
        <footer className="mt-6 flex justify-end gap-2 border-t border-borde pt-4">
          <button type="button" onClick={() => dialogo.current?.close()} className={claseBoton("secundario", "md")}>
            Entendido
          </button>
        </footer>
      </dialog>
    </>
  );
}
