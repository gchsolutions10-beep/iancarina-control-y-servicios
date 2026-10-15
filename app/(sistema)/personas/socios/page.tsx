import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { SelectFiltro } from "@/components/reportes/campo-filtro";
import { FormularioFiltros } from "@/components/reportes/formulario-filtros";
import { requerirSesion } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { db } from "@/lib/db";
import { leerFiltros } from "@/lib/fichas/filtros";
import { hoyPlanta } from "@/lib/tiempo";
import { nombreParte } from "@/lib/validations/fichas";

export const metadata: Metadata = { title: "Socios y propietarios" };

/** Relaciones persona–empresa: por defecto, las vigentes hoy. */
export default async function Socios({ searchParams }: PageProps<"/personas/socios">) {
  const usuario = await requerirSesion();
  const f = await leerFiltros(usuario, await searchParams);
  if (f.opcionesEmpresa.length === 0) redirect("/sin-acceso");
  const hoy = new Date(`${hoyPlanta()}T00:00:00Z`);
  const todas = f.estado === "todas";
  const filas = await db.relaciones_empresa.findMany({
    where: { empresa: { in: f.empresas }, ...(todas ? {} : { desde: { lte: hoy }, OR: [{ hasta: null }, { hasta: { gte: hoy } }] }) },
    orderBy: [{ empresa: "asc" }, { tipo_relacion: "asc" }, { desde: "asc" }],
    include: { partes: { select: { id: true, tipo: true, nombres: true, apellidos: true, razon_social: true } } },
  });
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado titulo="Socios y propietarios" subtitulo={`${filas.length} relaciones ${todas ? "(todas)" : "vigentes hoy"}`} ayuda={<AyudaModulo guia={guia("relaciones-empresa")} />} />
      <FormularioFiltros accion="/personas/socios" etiqueta="Filtrar relaciones">
        <SelectFiltro nombre="estado" etiqueta="Mostrar" valor={f.estado} opciones={[{ valor: "todas", etiqueta: "Todas (incluye terminadas)" }]} todos="Vigentes hoy" />
        {f.opcionesEmpresa.length > 1 && <SelectFiltro nombre="empresa" etiqueta="Empresa" valor={f.empresa} opciones={f.opcionesEmpresa} todos="Todas" />}
      </FormularioFiltros>
      <div className="mt-5">
        <Tabla
          columnas={["Persona", "Relación", "Porcentaje", "Desde", "Hasta", ...(f.opcionesEmpresa.length > 1 ? ["Empresa"] : []), "Estado"]}
          vacio="No hay relaciones con estos filtros."
          filas={filas.map((r) => [
            <Link key="p" href={`/personas/${r.partes.id}`} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
              {nombreParte(r.partes)}
            </Link>,
            r.tipo_relacion,
            r.porcentaje ? `${Number(r.porcentaje).toLocaleString("es-VE")} %` : "—",
            iso(r.desde),
            iso(r.hasta),
            ...(f.opcionesEmpresa.length > 1 ? [f.nombreEmpresa(r.empresa)] : []),
            <Insignia key="e" estado={r.hasta && r.hasta < hoy ? "terminada" : "vigente"} />,
          ])}
        />
      </div>
    </main>
  );
}
