import { Seccion } from "@/components/formularios/controles";
import { formatearHoraPared } from "@/lib/tiempo";

type Evento = { id: string; fecha: Date; usuario: string; operacion: string | null; descripcion: string | null; motivo: string | null };

/** Historial de cambios de la ficha, tomado de la bitácora (no se puede editar). */
export function Historial({ eventos }: { eventos: Evento[] }) {
  return (
    <Seccion titulo="Historial" descripcion="Quién hizo cada cambio y cuándo. La bitácora no se puede modificar.">
      {eventos.length === 0 ? (
        <p className="text-sm text-tinta-suave">Sin movimientos.</p>
      ) : (
        <ol className="flex flex-col gap-3 border-l border-borde pl-4">
          {eventos.map((e) => (
            <li key={e.id} className="text-sm">
              <p className="text-xs text-tinta-tenue">
                {formatearHoraPared(e.fecha)} · {e.usuario}
                {e.operacion && <span className="ml-1.5 rounded bg-superficie-2 px-1.5 py-0.5 font-medium text-tinta-suave">{e.operacion}</span>}
              </p>
              <p className="mt-0.5 break-words text-tinta">{e.descripcion}</p>
              {e.motivo && <p className="text-xs text-tinta-suave">Motivo: {e.motivo}</p>}
            </li>
          ))}
        </ol>
      )}
    </Seccion>
  );
}
