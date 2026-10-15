import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioVehiculo } from "@/components/fichas/formularios-activos";
import { Encabezado } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";
import { requerirSesion } from "@/lib/auth/dal";
import { modelosConMarca, valoresCatalogo } from "@/lib/fichas/datos";
import { leerFiltros } from "@/lib/fichas/filtros";

export const metadata: Metadata = { title: "Nuevo vehículo" };

export default async function NuevoVehiculo({ searchParams }: PageProps<"/activos/vehiculos/nuevo">) {
  const usuario = await requerirSesion();
  const f = await leerFiltros(usuario, await searchParams);
  if (f.empresasRegistrar.length === 0) redirect("/sin-acceso");
  const [modelos, colores, tipos, chutos] = await Promise.all([modelosConMarca(), valoresCatalogo("color"), valoresCatalogo("tipo_vehiculo"), valoresCatalogo("clasificacion_chuto")]);
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado volver={{ href: "/activos/vehiculos", etiqueta: "Vehículos" }} titulo="Nuevo vehículo" />
      <Seccion titulo="Datos del vehículo" descripcion="Después de crearlo podrás registrar su propietario, fotos y documentos.">
        <FormularioVehiculo v={{}} empresas={f.empresasRegistrar} modelos={modelos} colores={colores} tipos={tipos} chutos={chutos} />
      </Seccion>
    </main>
  );
}
