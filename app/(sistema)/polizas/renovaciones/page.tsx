import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prepararRenovacion } from "@/actions/endosos";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { BotonAccion } from "@/components/formularios/boton-accion";
import { Seccion } from "@/components/formularios/controles";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { leerFiltros } from "@/lib/fichas/filtros";
import { porRenovar } from "@/lib/polizas/datos";

export const metadata: Metadata = { title: "Renovación anual" };

export default async function Renovaciones({ searchParams }: PageProps<"/polizas/renovaciones">) {
  const usuario = await requerirSesion();
  const f = await leerFiltros(usuario, await searchParams);
  if (f.opcionesEmpresa.length === 0) redirect("/sin-acceso");
  const { dias, pendientes, enCurso } = await porRenovar(f.empresas);
  const varias = f.opcionesEmpresa.length > 1;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado titulo="Renovación anual" subtitulo={`Vigencias que terminan en los próximos ${dias} días o ya terminaron sin renovarse`} ayuda={<AyudaModulo guia={guia("renovaciones")} />} />
      <div className="flex flex-col gap-6">
        <Seccion titulo="En preparación" descripcion="Renovaciones creadas que falta revisar y confirmar.">
          <Tabla
            columnas={["Póliza", "Aseguradora", "Ramo", "Nueva vigencia", ...(varias ? ["Empresa"] : []), ""]}
            vacio="No hay renovaciones en preparación."
            filas={enCurso.map((r) => [
              r.numero,
              r.aseguradora,
              r.ramo,
              `${r.desde} → ${r.hasta}`,
              ...(varias ? [f.nombreEmpresa(r.empresa)] : []),
              <Link key="l" href={`/polizas/periodos/${r.id}`} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
                Revisar y confirmar
              </Link>,
            ])}
          />
        </Seccion>
        <Seccion titulo="Por renovar" descripcion="«Preparar» crea el período siguiente con los asegurados elegibles (excluye lo vendido antes del inicio), sus coberturas, partes y tarifas del año anterior.">
          <Tabla
            columnas={["Póliza", "Aseguradora", "Ramo", "Vence", "Estado", ...(varias ? ["Empresa"] : []), ""]}
            vacio="No hay vigencias por renovar en el plazo."
            filas={pendientes.map((r) => [
              <Link key="p" href={`/polizas/periodos/${r.id}`} className="text-marca-700 hover:underline dark:text-marca-400">
                {r.numero}
              </Link>,
              r.aseguradora,
              r.ramo,
              r.hasta,
              <Insignia key="e" estado={r.diasRestantes <= 0 ? "vencido" : "por_vencer"} />,
              ...(varias ? [f.nombreEmpresa(r.empresa)] : []),
              tienePermiso(usuario, "seguros.registrar", r.empresa) ? (
                <BotonAccion key="b" accion={prepararRenovacion} ocultos={{ id_periodo: String(r.id) }} variante="primario">
                  Preparar renovación
                </BotonAccion>
              ) : null,
            ])}
          />
        </Seccion>
      </div>
    </main>
  );
}
