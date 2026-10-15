import Link from "next/link";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Encabezado, Tabla } from "@/components/fichas/piezas";
import { SelectFiltro, TextoFiltro } from "@/components/reportes/campo-filtro";
import { FormularioFiltros } from "@/components/reportes/formulario-filtros";
import { Paginacion } from "@/components/reportes/paginacion";
import { claseBoton } from "@/components/ui/boton";
import { POR_PAGINA } from "@/lib/fichas/datos";
import { enlace } from "@/lib/fichas/filtros";

type Props = {
  base: string;
  titulo: string;
  total: number;
  ayuda: ReactNode;
  nuevo?: { href: string; texto: string };
  f: { q: string; estado: string; empresa: string; pagina: number; opcionesEmpresa: { valor: string; etiqueta: string }[] };
  estados: { valor: string; etiqueta: string }[];
  buscar: string;
  columnas: string[];
  filas: ReactNode[][];
};

/** Listado filtrable de activos (vehículos o propiedades). */
export function ListaActivos({ base, titulo, total, ayuda, nuevo, f, estados, buscar, columnas, filas }: Props) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        titulo={titulo}
        subtitulo={`${total} registros`}
        ayuda={ayuda}
        acciones={
          nuevo && (
            <Link href={nuevo.href} className={claseBoton("primario", "lg")}>
              <Plus className="size-4" aria-hidden /> {nuevo.texto}
            </Link>
          )
        }
      />
      <FormularioFiltros accion={base} etiqueta={`Filtrar ${titulo.toLowerCase()}`}>
        <TextoFiltro nombre="q" etiqueta="Buscar" valor={f.q} placeholder={buscar} />
        <SelectFiltro nombre="estado" etiqueta="Estado" valor={f.estado} opciones={estados} />
        {f.opcionesEmpresa.length > 1 && <SelectFiltro nombre="empresa" etiqueta="Empresa" valor={f.empresa} opciones={f.opcionesEmpresa} todos="Todas" />}
      </FormularioFiltros>
      <div className="mt-5">
        <Tabla columnas={columnas} filas={filas} vacio="No hay registros con estos filtros." />
      </div>
      <div className="mt-4">
        <Paginacion pagina={f.pagina} porPagina={POR_PAGINA} total={total} enlace={(n) => enlace(base, { q: f.q, estado: f.estado, empresa: f.empresa, pagina: n })} />
      </div>
    </main>
  );
}
