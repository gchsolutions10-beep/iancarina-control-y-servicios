import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { ListaActivos } from "@/components/fichas/lista-activos";
import { Insignia } from "@/components/fichas/piezas";
import { requerirSesion } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { listarPropiedades } from "@/lib/fichas/datos";
import { leerFiltros } from "@/lib/fichas/filtros";

export const metadata: Metadata = { title: "Propiedades" };

export default async function Propiedades({ searchParams }: PageProps<"/activos/propiedades">) {
  const usuario = await requerirSesion();
  const f = await leerFiltros(usuario, await searchParams);
  if (f.opcionesEmpresa.length === 0) redirect("/sin-acceso");
  const { total, filas } = await listarPropiedades(f);
  const varias = f.opcionesEmpresa.length > 1;
  return (
    <ListaActivos
      base="/activos/propiedades"
      titulo="Propiedades"
      total={total}
      ayuda={<AyudaModulo guia={guia("propiedades")} />}
      nuevo={f.empresasRegistrar.length ? { href: "/activos/propiedades/nueva", texto: "Nueva propiedad" } : undefined}
      f={f}
      estados={[{ valor: "activa", etiqueta: "Activas" }, { valor: "vendida", etiqueta: "Vendidas" }, { valor: "retirada", etiqueta: "Retiradas" }]}
      buscar="Nombre o dirección"
      columnas={["Nombre", "Tipo", "Valor declarado", ...(varias ? ["Empresa"] : []), "Estado"]}
      filas={filas.map((p) => [
        <Link key="n" href={`/activos/propiedades/${p.id}`} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
          {p.nombre}
        </Link>,
        p.tipo ?? "—",
        <span key="v" className="tabular-nums">{p.valor}</span>,
        ...(varias ? [f.nombreEmpresa(p.empresa)] : []),
        <Insignia key="e" estado={p.estado} />,
      ])}
    />
  );
}
