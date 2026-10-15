import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { SelectFiltro, TextoFiltro } from "@/components/reportes/campo-filtro";
import { FormularioFiltros } from "@/components/reportes/formulario-filtros";
import { Paginacion } from "@/components/reportes/paginacion";
import { claseBoton } from "@/components/ui/boton";
import { requerirSesion } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { listarPartes, POR_PAGINA } from "@/lib/fichas/datos";
import { enlace, leerFiltros } from "@/lib/fichas/filtros";

export const metadata: Metadata = { title: "Personas" };

export default async function Personas({ searchParams }: PageProps<"/personas/fichas">) {
  const usuario = await requerirSesion();
  const f = await leerFiltros(usuario, await searchParams);
  if (f.opcionesEmpresa.length === 0) redirect("/sin-acceso");
  const tipo = f.tipo === "natural" || f.tipo === "juridica" ? f.tipo : "";
  const { total, filas } = await listarPartes({ empresas: f.empresas, q: f.q, tipo, pagina: f.pagina });
  const base = "/personas/fichas";

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        titulo="Personas y empresas"
        subtitulo={`${total} fichas`}
        ayuda={<AyudaModulo guia={guia("personas")} />}
        acciones={
          f.empresasRegistrar.length > 0 && (
            <Link href="/personas/nueva" className={claseBoton("primario", "lg")}>
              <Plus className="size-4" aria-hidden /> Nueva ficha
            </Link>
          )
        }
      />
      <FormularioFiltros accion={base} etiqueta="Filtrar personas">
        <TextoFiltro nombre="q" etiqueta="Buscar" valor={f.q} placeholder="Nombre, razón social o identificación" />
        <SelectFiltro nombre="tipo" etiqueta="Tipo" valor={tipo} opciones={[{ valor: "natural", etiqueta: "Personas naturales" }, { valor: "juridica", etiqueta: "Empresas (jurídicas)" }]} />
        {f.opcionesEmpresa.length > 1 && <SelectFiltro nombre="empresa" etiqueta="Empresa" valor={f.empresa} opciones={f.opcionesEmpresa} todos="Todas" />}
      </FormularioFiltros>
      <div className="mt-5">
        <Tabla
          columnas={["Nombre", "Identificación", "Tipo", ...(f.opcionesEmpresa.length > 1 ? ["Empresa"] : []), "Estado"]}
          vacio="No hay fichas con estos filtros."
          filas={filas.map((p) => [
            <Link key="n" href={`/personas/${p.id}`} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
              {p.nombre}
            </Link>,
            `${p.tipo_identificacion}-${p.numero_identificacion}`,
            p.tipo === "natural" ? "Natural" : `Jurídica${p.funciones.length ? ` · ${p.funciones.join(", ")}` : ""}`,
            ...(f.opcionesEmpresa.length > 1 ? [f.nombreEmpresa(p.empresa)] : []),
            <Insignia key="e" estado={p.estado} />,
          ])}
        />
      </div>
      <div className="mt-4">
        <Paginacion pagina={f.pagina} porPagina={POR_PAGINA} total={total} enlace={(n) => enlace(base, { q: f.q, tipo, empresa: f.empresa, pagina: n })} />
      </div>
    </main>
  );
}
