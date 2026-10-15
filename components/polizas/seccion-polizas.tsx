import Link from "next/link";
import { Insignia, Tabla } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";

type Fila = { id_periodo: number; poliza: string; aseguradora: string; ramo: string; desde: string; hasta: string; estadoPeriodo: string; baja: boolean };

/** Pólizas donde la ficha figura como asegurada (una fila por vigencia). */
export function SeccionPolizas({ filas, hoy }: { filas: Fila[]; hoy: string }) {
  return (
    <Seccion titulo="Pólizas" descripcion="Vigencias donde figura como asegurado, con sus fechas de inclusión.">
      <Tabla
        columnas={["Póliza", "Aseguradora", "Ramo", "Cubierto", "Estado"]}
        vacio="No figura como asegurado en ninguna póliza."
        filas={filas.map((f) => [
          <Link key="p" href={`/polizas/periodos/${f.id_periodo}`} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
            {f.poliza}
          </Link>,
          f.aseguradora,
          f.ramo,
          `${f.desde} → ${f.hasta}`,
          <Insignia key="e" estado={f.estadoPeriodo === "borrador" ? "borrador" : f.baja ? "baja" : hoy >= f.hasta ? "terminada" : hoy < f.desde ? "futuro" : "vigente"} />,
        ])}
      />
    </Seccion>
  );
}
