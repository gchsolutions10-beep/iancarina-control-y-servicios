import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Tarjetas de control arriba de un listado (vencidas, por vencer, vigentes…). Cada una filtra el
 * listado y se vuelve a pulsar para quitar el filtro. Cuentan con los demás filtros aplicados.
 */
export function TarjetasControl({ tarjetas, activo, enlace }: {
  tarjetas: { valor: string; etiqueta: string; n: number; tono?: "baja" | "aviso" | "ok" | "neutro" }[];
  activo: string;
  enlace: (estado: string) => string;
}) {
  return (
    <nav data-recorrido="tarjetas" aria-label="Filtrar por estado" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tarjetas.map((t) => {
        const seleccionada = activo === t.valor;
        return (
          <Link
            key={t.valor}
            href={enlace(seleccionada ? "" : t.valor)}
            aria-current={seleccionada ? "true" : undefined}
            className={cn(
              "rounded-xl border bg-superficie px-4 py-3 shadow-xs transition-colors hover:bg-superficie-2",
              seleccionada ? "border-marca-600 ring-2 ring-marca-600/20" : "border-borde",
            )}
          >
            <span className="block text-xs text-tinta-suave">{t.etiqueta}</span>
            <span
              className={cn(
                "mt-1 block text-2xl font-semibold tabular-nums",
                t.n > 0 && t.tono === "baja" ? "text-error" : t.n > 0 && t.tono === "aviso" ? "text-aviso" : "text-tinta",
              )}
            >
              {t.n}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Indicador de resultado: etiqueta, valor grande y detalle (fórmula o unidad). */
export function Indicador({ etiqueta, valor, detalle }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-borde bg-superficie px-4 py-3 shadow-xs">
      <p className="text-xs text-tinta-suave">{etiqueta}</p>
      <p className="mt-1 text-lg font-semibold break-words tabular-nums text-tinta sm:text-xl">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-tinta-tenue">{detalle}</p>}
    </div>
  );
}

/** Marca «Propuesta»: regla de mercado autorizada por GCH, aún no confirmada con el contrato. */
export function MarcaPropuesta() {
  return <span className="rounded bg-aviso/15 px-1.5 py-0.5 text-[11px] font-medium text-tinta">Propuesta</span>;
}
