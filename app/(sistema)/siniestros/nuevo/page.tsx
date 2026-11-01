import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Encabezado } from "@/components/fichas/piezas";
import { AvisoBloqueo, Seccion } from "@/components/formularios/controles";
import { FormularioSiniestro } from "@/components/siniestros/formularios";
import { claseBoton } from "@/components/ui/boton";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { leerFiltros } from "@/lib/fichas/filtros";
import { opcionesSujetos } from "@/lib/polizas/datos";
import { SUJETOS_SINIESTRO, tiposSiniestro } from "@/lib/siniestros/datos";
import { hoyPlanta } from "@/lib/tiempo";

export const metadata: Metadata = { title: "Nuevo expediente" };

export default async function NuevoSiniestro({ searchParams }: PageProps<"/siniestros/nuevo">) {
  const usuario = await requerirSesion();
  const params = await searchParams;
  const f = await leerFiltros(usuario, params);
  if (f.empresasRegistrar.length === 0) redirect("/sin-acceso");
  const empresa = f.empresasRegistrar.length === 1 ? f.empresasRegistrar[0].valor : f.empresasRegistrar.find((e) => e.valor === params.empresa)?.valor;
  const volver = { href: params.sujeto === "transporte" ? "/siniestros/lista?sujeto=transporte" : "/siniestros/lista", etiqueta: "Siniestros" };
  const enlace = (extra: Record<string, string>) => `/siniestros/nuevo?${new URLSearchParams({ ...(empresa ? { empresa } : {}), ...(params.sujeto === "transporte" ? { sujeto: "transporte" } : {}), ...extra })}`;

  if (!empresa) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <Encabezado volver={volver} titulo="Nuevo expediente" subtitulo="¿De qué empresa es el siniestro?" />
        <div data-recorrido="elegir-empresa" className="flex flex-wrap gap-2">
          {f.empresasRegistrar.map((e) => (
            <Link key={e.valor} href={`/siniestros/nuevo?empresa=${e.valor}${params.sujeto === "transporte" ? "&sujeto=transporte" : ""}`} className={claseBoton("secundario", "lg")}>
              {e.etiqueta}
            </Link>
          ))}
        </div>
      </main>
    );
  }

  const tipos = (await tiposSiniestro()).filter((t) => (params.sujeto === "transporte" ? t.sujeto === "transporte" : true));
  const tipo = tipos.find((t) => String(t.id) === params.tipo);
  if (!tipo) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <Encabezado volver={volver} titulo="Nuevo expediente" subtitulo={`${f.nombreEmpresa(empresa)} · ¿Qué tipo de siniestro es?`} />
        <ul data-recorrido="elegir-tipo" className="grid gap-3 sm:grid-cols-2">
          {tipos.map((t) => (
            <li key={t.id}>
              <Link href={enlace({ tipo: String(t.id) })} className="block rounded-xl border border-borde bg-superficie px-4 py-3 shadow-xs transition-colors hover:bg-superficie-2">
                <span className="font-medium text-tinta">{t.nombre}</span>
                <span className="block text-xs text-tinta-suave">
                  {SUJETOS_SINIESTRO[t.sujeto as keyof typeof SUJETOS_SINIESTRO]} · flujo {t.flujos.nombre}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const sujeto = tipo.sujeto as keyof typeof SUJETOS_SINIESTRO;
  const sensibles = tienePermiso(usuario, "personas.datos_sensibles", empresa);
  const [sujetos, transportistas, vehiculos] = await Promise.all([
    sujeto === "transporte" ? Promise.resolve([]) : opcionesSujetos(empresa, sujeto),
    sujeto === "transporte"
      ? db.partes.findMany({ where: { empresa, tipo: "juridica", estado: "activa", funciones: { has: "Transportista" } }, orderBy: { razon_social: "asc" }, select: { id: true, razon_social: true } })
      : Promise.resolve([]),
    sujeto === "transporte" ? opcionesSujetos(empresa, "vehiculo") : Promise.resolve([]),
  ]);
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado volver={volver} titulo="Nuevo expediente" subtitulo={`${f.nombreEmpresa(empresa)} · ${tipo.nombre}`} />
      <Seccion titulo="Datos del siniestro" descripcion={`Se numera solo (SIN-${hoyPlanta().slice(0, 4)}-…) y empieza en la primera etapa del flujo «${tipo.flujos.nombre}». La póliza que responde se vincula después, en el expediente.`}>
        {sujeto === "persona" && !sensibles ? (
          <AvisoBloqueo>Los siniestros de personas son confidenciales: hace falta el permiso «Ver datos personales» en esta empresa.</AvisoBloqueo>
        ) : (
          <>
            {sujeto === "persona" && <AvisoBloqueo>Expediente confidencial: solo lo verán quienes tienen «Ver datos personales».</AvisoBloqueo>}
            <FormularioSiniestro
              empresa={empresa}
              tipo={{ id: tipo.id, sujeto }}
              sujetos={sujetos}
              transportistas={transportistas.map((t) => ({ valor: String(t.id), etiqueta: t.razon_social ?? "" }))}
              vehiculos={vehiculos}
              hoy={hoyPlanta()}
            />
          </>
        )}
      </Seccion>
      <p className="mt-4 text-sm">
        <Link href={enlace({})} className="text-marca-700 hover:underline dark:text-marca-400">
          ← Elegir otro tipo
        </Link>
      </p>
    </main>
  );
}
