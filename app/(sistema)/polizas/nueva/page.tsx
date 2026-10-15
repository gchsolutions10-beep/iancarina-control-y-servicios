import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Encabezado } from "@/components/fichas/piezas";
import { AvisoBloqueo, Seccion } from "@/components/formularios/controles";
import { FormularioPoliza } from "@/components/polizas/formulario-poliza";
import { claseBoton } from "@/components/ui/boton";
import { requerirSesion } from "@/lib/auth/dal";
import { opcionesPartes } from "@/lib/fichas/datos";
import { leerFiltros } from "@/lib/fichas/filtros";
import { opcionesAseguradoras, ramos } from "@/lib/polizas/datos";
import { hoyPlanta } from "@/lib/tiempo";

export const metadata: Metadata = { title: "Nueva póliza" };

export default async function NuevaPoliza({ searchParams }: PageProps<"/polizas/nueva">) {
  const usuario = await requerirSesion();
  const params = await searchParams;
  const f = await leerFiltros(usuario, params);
  if (f.empresasRegistrar.length === 0) redirect("/sin-acceso");
  const elegida = f.empresasRegistrar.length === 1 ? f.empresasRegistrar[0].valor : f.empresasRegistrar.find((e) => e.valor === params.empresa)?.valor;

  if (!elegida) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <Encabezado volver={{ href: "/polizas/lista", etiqueta: "Pólizas" }} titulo="Nueva póliza" subtitulo="¿De qué empresa es la póliza?" />
        <div className="flex flex-wrap gap-2">
          {f.empresasRegistrar.map((e) => (
            <Link key={e.valor} href={`/polizas/nueva?empresa=${e.valor}`} className={claseBoton("secundario", "lg")}>
              {e.etiqueta}
            </Link>
          ))}
        </div>
      </main>
    );
  }

  const [aseguradoras, listaRamos, partes] = await Promise.all([opcionesAseguradoras(elegida), ramos(), opcionesPartes(elegida)]);
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado volver={{ href: "/polizas/lista", etiqueta: "Pólizas" }} titulo="Nueva póliza" subtitulo={f.nombreEmpresa(elegida)} />
      <Seccion titulo="Datos de la póliza" descripcion="Se crea con su primera vigencia en preparación. Después agregas asegurados, coberturas y tarifas, calculas y confirmas.">
        {aseguradoras.length === 0 ? (
          <AvisoBloqueo>
            Primero registra la aseguradora en <Link href="/personas/nueva" className="text-marca-700 underline dark:text-marca-400">Personas</Link> como empresa con la función «Aseguradora».
          </AvisoBloqueo>
        ) : (
          <FormularioPoliza
            empresa={elegida}
            aseguradoras={aseguradoras}
            ramos={listaRamos.map((r) => ({ valor: String(r.id), etiqueta: r.nombre }))}
            partes={partes}
            hoy={hoyPlanta()}
          />
        )}
      </Seccion>
    </main>
  );
}
