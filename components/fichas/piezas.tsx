import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, CircleCheck, CircleDashed, CircleMinus, CircleX, Clock, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/** Encabezado de pantalla con regreso, título, subtítulo y acciones. */
export function Encabezado({ volver, titulo, subtitulo, ayuda, acciones }: { volver?: { href: string; etiqueta: string }; titulo: ReactNode; subtitulo?: ReactNode; ayuda?: ReactNode; acciones?: ReactNode }) {
  return (
    <header className="mb-6">
      {volver && (
        <Link href={volver.href} className="mb-2 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
          <ChevronLeft className="size-4" aria-hidden />
          {volver.etiqueta}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h1 data-recorrido="titulo" className="text-2xl font-semibold tracking-tight text-balance text-tinta sm:text-3xl">{titulo}</h1>
            {subtitulo && <p className="mt-1 text-sm text-tinta-suave">{subtitulo}</p>}
          </div>
          {ayuda}
        </div>
        {acciones && <div data-recorrido="acciones">{acciones}</div>}
      </div>
    </header>
  );
}

const ESTADOS: Record<string, { texto: string; tono: "ok" | "neutro" | "baja" | "aviso"; icono: typeof CircleCheck }> = {
  activo: { texto: "Activo", tono: "ok", icono: CircleCheck },
  activa: { texto: "Activa", tono: "ok", icono: CircleCheck },
  inactiva: { texto: "Inactiva", tono: "neutro", icono: CircleMinus },
  vendido: { texto: "Vendido", tono: "baja", icono: CircleX },
  vendida: { texto: "Vendida", tono: "baja", icono: CircleX },
  retirado: { texto: "Retirado", tono: "baja", icono: CircleX },
  retirada: { texto: "Retirada", tono: "baja", icono: CircleX },
  vigente: { texto: "Vigente", tono: "ok", icono: CircleCheck },
  terminada: { texto: "Terminada", tono: "neutro", icono: CircleMinus },
  // Pólizas (vigencia) y primas
  borrador: { texto: "En preparación", tono: "neutro", icono: CircleDashed },
  futuro: { texto: "Por iniciar", tono: "neutro", icono: Clock },
  por_vencer: { texto: "Por vencer", tono: "aviso", icono: TriangleAlert },
  vencido: { texto: "Vencida", tono: "baja", icono: CircleX },
  anulado: { texto: "Anulada", tono: "neutro", icono: CircleMinus },
  sin_periodo: { texto: "Sin vigencia", tono: "neutro", icono: CircleMinus },
  pagada: { texto: "Pagada", tono: "ok", icono: CircleCheck },
  vencida: { texto: "Vencida", tono: "baja", icono: CircleX },
  pendiente: { texto: "Pendiente", tono: "neutro", icono: Clock },
  anulada: { texto: "Anulada", tono: "neutro", icono: CircleMinus },
  baja: { texto: "Dado de baja", tono: "baja", icono: CircleX },
  // Personas duplicadas
  fusionada: { texto: "Fusionada", tono: "neutro", icono: CircleMinus },
  revertida: { texto: "Revertida", tono: "neutro", icono: CircleMinus },
  // Siniestros (prefijo sin_ para no chocar con otros estados)
  sin_sin_movimiento: { texto: "Sin movimiento", tono: "baja", icono: TriangleAlert },
  sin_abierto: { texto: "Abierto", tono: "aviso", icono: Clock },
  sin_por_cobrar: { texto: "Cerrado, por cobrar", tono: "aviso", icono: Clock },
  sin_cerrado: { texto: "Cerrado", tono: "ok", icono: CircleCheck },
  sin_anulado: { texto: "Anulado", tono: "neutro", icono: CircleMinus },
  // Límites (riesgos diversos)
  lim_ok: { texto: "Dentro del límite", tono: "ok", icono: CircleCheck },
  lim_aviso: { texto: "Cerca del límite", tono: "aviso", icono: TriangleAlert },
  lim_excedido: { texto: "Excedido", tono: "baja", icono: CircleX },
};

/** Estado con ícono y texto (nunca solo color). */
export function Insignia({ estado }: { estado: string }) {
  const e = ESTADOS[estado] ?? { texto: estado, tono: "neutro" as const, icono: CircleMinus };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        e.tono === "ok" && "bg-exito/10 text-exito",
        e.tono === "neutro" && "bg-superficie-2 text-tinta-suave",
        e.tono === "baja" && "bg-error/10 text-error",
        e.tono === "aviso" && "bg-aviso/15 text-tinta",
      )}
    >
      <e.icono className="size-3.5" aria-hidden />
      {e.texto}
    </span>
  );
}

/** Lista de datos «etiqueta: valor» de solo lectura. */
export function Datos({ filas }: { filas: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {filas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="min-w-0">
          <dt className="text-tinta-tenue">{etiqueta}</dt>
          <dd className="mt-0.5 break-words text-tinta">{valor === null || valor === undefined || valor === "" ? "—" : valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tabla simple con estado vacío. */
export function Tabla({ columnas, filas, vacio }: { columnas: string[]; filas: ReactNode[][]; vacio: string }) {
  if (filas.length === 0) return <p className="rounded-lg border border-dashed border-borde-fuerte px-4 py-6 text-center text-sm text-tinta-suave">{vacio}</p>;
  return (
    <div data-recorrido="tabla" className="overflow-x-auto rounded-lg border border-borde">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="bg-superficie-2 text-xs text-tinta-suave">
          <tr>
            {columnas.map((c) => (
              <th key={c} scope="col" className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {filas.map((f, i) => (
            <tr key={i} className="align-top">
              {f.map((celda, j) => (
                <td key={j} className="px-3 py-2.5 text-tinta">
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
