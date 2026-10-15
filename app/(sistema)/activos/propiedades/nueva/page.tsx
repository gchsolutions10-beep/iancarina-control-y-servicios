import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioPropiedad } from "@/components/fichas/formularios-activos";
import { Encabezado } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";
import { requerirSesion } from "@/lib/auth/dal";
import { valoresCatalogo } from "@/lib/fichas/datos";
import { leerFiltros } from "@/lib/fichas/filtros";

export const metadata: Metadata = { title: "Nueva propiedad" };

export default async function NuevaPropiedad({ searchParams }: PageProps<"/activos/propiedades/nueva">) {
  const usuario = await requerirSesion();
  const f = await leerFiltros(usuario, await searchParams);
  if (f.empresasRegistrar.length === 0) redirect("/sin-acceso");
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado volver={{ href: "/activos/propiedades", etiqueta: "Propiedades" }} titulo="Nueva propiedad" />
      <Seccion titulo="Datos de la propiedad" descripcion="Después de crearla podrás registrar su propietario, fotos y documentos.">
        <FormularioPropiedad p={{}} empresas={f.empresasRegistrar} tipos={await valoresCatalogo("tipo_inmueble")} />
      </Seccion>
    </main>
  );
}
