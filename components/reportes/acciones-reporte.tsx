import Link from "next/link";
import { FileSpreadsheet, Printer } from "lucide-react";
import { claseBoton } from "@/components/ui/boton";

/** Exportar a Excel (todas las filas filtradas) e imprimir / guardar como PDF. */
export function AccionesReporte({ excel, imprimir }: { excel: string; imprimir: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a href={excel} className={claseBoton("secundario", "lg")} download>
        <FileSpreadsheet className="size-4" aria-hidden />
        Excel
      </a>
      <Link href={imprimir} className={claseBoton("secundario", "lg")} target="_blank">
        <Printer className="size-4" aria-hidden />
        Imprimir o PDF
      </Link>
    </div>
  );
}
