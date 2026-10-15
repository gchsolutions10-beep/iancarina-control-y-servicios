import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { TarjetasControl } from "@/components/polizas/piezas";
import { SelectFiltro, TextoFiltro } from "@/components/reportes/campo-filtro";
import { FormularioFiltros } from "@/components/reportes/formulario-filtros";
import { Paginacion } from "@/components/reportes/paginacion";
import { claseBoton } from "@/components/ui/boton";
import { requerirSesion } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { enlace, leerFiltros } from "@/lib/fichas/filtros";
import { listarPolizas, POR_PAGINA, ramos } from "@/lib/polizas/datos";

export const metadata: Metadata = { title: "Pólizas" };

const BASE = "/polizas/lista";

export default async function ListaPolizas({ searchParams }: PageProps<"/polizas/lista">) {
  const usuario = await requerirSesion();
  const params = await searchParams;
  const f = await leerFiltros(usuario, params);
  if (f.opcionesEmpresa.length === 0) redirect("/sin-acceso");
  const ramo = typeof params.ramo === "string" ? params.ramo : "";
  const [{ total, conteo, filas }, listaRamos] = await Promise.all([listarPolizas({ ...f, ramo }), ramos(false)]);
  const varias = f.opcionesEmpresa.length > 1;
  const filtros = { q: f.q, empresa: f.empresa, ramo, estado: f.estado };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        titulo="Pólizas"
        subtitulo={`${total} pólizas`}
        ayuda={<AyudaModulo guia={guia("polizas")} />}
        acciones={
          f.empresasRegistrar.length > 0 && (
            <Link href="/polizas/nueva" className={claseBoton("primario", "lg")}>
              <Plus className="size-4" aria-hidden /> Nueva póliza
            </Link>
          )
        }
      />
      <TarjetasControl
        activo={f.estado}
        enlace={(estado) => enlace(BASE, { ...filtros, estado })}
        tarjetas={[
          { valor: "vencido", etiqueta: "Vencidas", n: conteo.vencido ?? 0, tono: "baja" },
          { valor: "por_vencer", etiqueta: "Por vencer", n: conteo.por_vencer ?? 0, tono: "aviso" },
          { valor: "vigente", etiqueta: "Vigentes", n: conteo.vigente ?? 0, tono: "ok" },
          { valor: "futuro", etiqueta: "Por iniciar", n: conteo.futuro ?? 0 },
          { valor: "borrador", etiqueta: "En preparación", n: conteo.borrador ?? 0 },
          { valor: "anulado", etiqueta: "Anuladas", n: conteo.anulado ?? 0 },
        ]}
      />
      <FormularioFiltros accion={BASE} etiqueta="Filtrar pólizas">
        <TextoFiltro nombre="q" etiqueta="Buscar" valor={f.q} placeholder="Número, aseguradora o descripción" />
        <SelectFiltro nombre="ramo" etiqueta="Ramo" valor={ramo} opciones={listaRamos.map((r) => ({ valor: String(r.id), etiqueta: r.nombre }))} />
        {f.estado && <input type="hidden" name="estado" value={f.estado} />}
        {varias && <SelectFiltro nombre="empresa" etiqueta="Empresa" valor={f.empresa} opciones={f.opcionesEmpresa} todos="Todas" />}
      </FormularioFiltros>
      <div className="mt-5">
        <Tabla
          columnas={["Número", "Aseguradora", "Ramo", "Vigencia", ...(varias ? ["Empresa"] : []), "Estado"]}
          vacio="No hay pólizas con estos filtros."
          filas={filas.map((p) => [
            <Link key="n" href={`/polizas/${p.id}`} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
              {p.numero}
            </Link>,
            p.aseguradora,
            p.ramo,
            p.desde ? `${p.desde} → ${p.hasta}` : "—",
            ...(varias ? [f.nombreEmpresa(p.empresa)] : []),
            <span key="e" className="flex flex-wrap gap-1">
              <Insignia estado={p.estado} />
              {p.enRenovacion && <Insignia estado="borrador" />}
            </span>,
          ])}
        />
      </div>
      <div className="mt-4">
        <Paginacion pagina={f.pagina} porPagina={POR_PAGINA} total={total} enlace={(n) => enlace(BASE, { ...filtros, pagina: n })} />
      </div>
    </main>
  );
}
