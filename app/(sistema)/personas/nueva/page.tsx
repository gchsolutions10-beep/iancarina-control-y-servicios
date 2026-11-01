import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormularioParte } from "@/components/fichas/formulario-parte";
import { Encabezado } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { valoresCatalogo } from "@/lib/fichas/datos";
import { leerFiltros } from "@/lib/fichas/filtros";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Nueva ficha" };

export default async function NuevaParte({ searchParams }: PageProps<"/personas/nueva">) {
  const usuario = await requerirSesion();
  const p = await searchParams;
  const f = await leerFiltros(usuario, p);
  if (f.empresasRegistrar.length === 0) redirect("/sin-acceso");
  const tipo = p.tipo === "juridica" ? "juridica" : "natural";
  const [tiposId, funciones] = await Promise.all([valoresCatalogo("tipo_identificacion"), valoresCatalogo("funcion_organizacion")]);
  const verSensibles = f.empresasRegistrar.some((e) => tienePermiso(usuario, "personas.datos_sensibles", e.valor));
  const pestana = (t: string, texto: string) => (
    <Link href={`/personas/nueva?tipo=${t}`} aria-current={tipo === t ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm", tipo === t ? "bg-marca-600 text-white" : "text-tinta-suave hover:bg-superficie-2")}>
      {texto}
    </Link>
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado volver={{ href: "/personas/fichas", etiqueta: "Personas" }} titulo="Nueva ficha" />
      <nav data-recorrido="tipo-ficha" className="mb-4 flex gap-2" aria-label="Tipo de ficha">
        {pestana("natural", "Persona natural")}
        {pestana("juridica", "Empresa / organización")}
      </nav>
      <Seccion titulo={tipo === "natural" ? "Persona natural" : "Empresa u organización"} descripcion="Asegurados, beneficiarios, propietarios, aseguradoras, talleres o transportistas.">
        <FormularioParte valores={{ tipo }} tiposId={tiposId} funciones={funciones} empresas={f.empresasRegistrar} verSensibles={verSensibles} />
      </Seccion>
    </main>
  );
}
