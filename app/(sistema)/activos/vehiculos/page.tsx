import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { ListaActivos } from "@/components/fichas/lista-activos";
import { Insignia } from "@/components/fichas/piezas";
import { requerirSesion } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { listarVehiculos } from "@/lib/fichas/datos";
import { leerFiltros } from "@/lib/fichas/filtros";
import { formatearTasa } from "@/lib/formato";

export const metadata: Metadata = { title: "Vehículos" };

export default async function Vehiculos({ searchParams }: PageProps<"/activos/vehiculos">) {
  const usuario = await requerirSesion();
  const f = await leerFiltros(usuario, await searchParams);
  if (f.opcionesEmpresa.length === 0) redirect("/sin-acceso");
  const { total, filas } = await listarVehiculos(f);
  const varias = f.opcionesEmpresa.length > 1;
  return (
    <ListaActivos
      base="/activos/vehiculos"
      titulo="Vehículos"
      total={total}
      ayuda={<AyudaModulo guia={guia("vehiculos")} />}
      nuevo={f.empresasRegistrar.length ? { href: "/activos/vehiculos/nuevo", texto: "Nuevo vehículo" } : undefined}
      f={f}
      estados={[{ valor: "activo", etiqueta: "Activos" }, { valor: "vendido", etiqueta: "Vendidos" }, { valor: "retirado", etiqueta: "Retirados" }]}
      buscar="Placa, marca o modelo"
      columnas={["Placa", "Vehículo", "Año", "Tipo", "TM", "Origen", ...(varias ? ["Empresa"] : []), "Estado"]}
      filas={filas.map((v) => [
        <Link key="p" href={`/activos/vehiculos/${v.id}`} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
          {v.placa}
        </Link>,
        v.vehiculo,
        v.anio ?? "—",
        v.tipo ?? "—",
        v.tm ? `${formatearTasa(v.tm)} t` : "—",
        v.origen === "propio" ? "Propio" : "Terceros",
        ...(varias ? [f.nombreEmpresa(v.empresa)] : []),
        <Insignia key="e" estado={v.estado} />,
      ])}
    />
  );
}
