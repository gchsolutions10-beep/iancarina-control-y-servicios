import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, LayoutDashboard } from "lucide-react";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado } from "@/components/fichas/piezas";
import { requerirSesion } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { empresasDe } from "@/lib/fichas/acceso";
import { REPORTES } from "@/lib/reportes/definiciones";

export const metadata: Metadata = { title: "Reportes" };

/** Lista de reportes: cada uno con filtros en la URL, Excel e impresión (PDF). */
export default async function ListaReportes() {
  const usuario = await requerirSesion();
  if (empresasDe(usuario, "seguros.ver").length === 0) redirect("/sin-acceso");
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado titulo="Reportes" subtitulo="Elija un reporte, combine los filtros y expórtelo a Excel o imprímalo como PDF." ayuda={<AyudaModulo guia={guia("reportes")} />} />
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {[{ id: "tablero", titulo: "Tablero gerencial", descripcion: "Primas y sumas aseguradas vigentes, saldos, siniestros por mes y próximos vencimientos.", href: "/reportes/tablero" }, ...REPORTES.map((r) => ({ id: r.id, titulo: r.titulo, descripcion: r.descripcion, href: `/reportes/${r.id}` }))].map((r) => (
          <li key={r.id}>
            <Link href={r.href} className="group flex h-full items-start gap-3 rounded-xl border border-borde bg-superficie px-4 py-4 shadow-xs transition-colors hover:border-borde-fuerte hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40">
              {r.id === "tablero" && <LayoutDashboard className="mt-0.5 size-5 shrink-0 text-marca-600" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-tinta">{r.titulo}</span>
                <span className="mt-1 block text-sm text-tinta-suave">{r.descripcion}</span>
              </span>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-tinta-tenue group-hover:text-tinta" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
