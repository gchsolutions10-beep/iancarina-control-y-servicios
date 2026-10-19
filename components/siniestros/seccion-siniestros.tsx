import Link from "next/link";
import { Lock } from "lucide-react";
import { Tabla } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";

type Fila = { id: number; numero: string; tipo: string; fecha: string; estado: string; reservado: boolean };
const ESTADO: Record<string, string> = { abierto: "Abierto", cerrado: "Cerrado", anulado: "Anulado" };

/** Expedientes donde la ficha figura como afectada (los confidenciales sin detalle si no hay permiso). */
export function SeccionSiniestros({ filas }: { filas: Fila[] }) {
  return (
    <Seccion titulo="Siniestros" descripcion="Expedientes donde figura como afectado.">
      <Tabla
        columnas={["Expediente", "Fecha", "Tipo", "Estado"]}
        vacio="Sin siniestros."
        filas={filas.map((s) => [
          s.reservado ? (
            <span key="n" className="inline-flex items-center gap-1 text-tinta-suave">
              <Lock className="size-3.5" aria-hidden /> Confidencial
            </span>
          ) : (
            <Link key="n" href={`/siniestros/${s.id}`} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
              {s.numero}
            </Link>
          ),
          s.fecha,
          s.reservado ? "—" : s.tipo,
          ESTADO[s.estado] ?? s.estado,
        ])}
      />
    </Seccion>
  );
}
