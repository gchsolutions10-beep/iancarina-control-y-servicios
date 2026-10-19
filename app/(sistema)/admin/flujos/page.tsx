import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { agregarFlujo, guardarEtapa, guardarTipoSiniestro } from "@/actions/flujos";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";
import { AreaTexto, Casilla, Entrada, FormularioAccion, Numero, Seleccion } from "@/components/formularios/formulario-accion";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { db } from "@/lib/db";
import { valoresCatalogo } from "@/lib/fichas/datos";
import { SUJETOS_SINIESTRO } from "@/lib/siniestros/datos";

export const metadata: Metadata = { title: "Flujos de siniestros" };

export default async function Flujos() {
  const usuario = await requerirSesion();
  if (!tienePermiso(usuario, "admin.sistema")) redirect("/sin-acceso");
  const [flujos, tipos, tiposDoc] = await Promise.all([
    db.flujos.findMany({ orderBy: { nombre: "asc" }, include: { flujo_etapas: { orderBy: [{ activo: "desc" }, { orden: "asc" }] } } }),
    db.tipos_siniestro.findMany({ orderBy: [{ sujeto: "asc" }, { nombre: "asc" }] }),
    valoresCatalogo("tipo_documento"),
  ]);
  const opcionesFlujo = flujos.map((f) => ({ valor: String(f.id), etiqueta: f.nombre }));
  const Documentos = ({ marcados }: { marcados: string[] }) => (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-tinta">Documentos requeridos</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {tiposDoc.map((t) => (
          <Casilla key={t.valor} nombre="documentos" valorCasilla={t.valor} etiqueta={t.etiqueta} valor={marcados.includes(t.valor)} />
        ))}
      </div>
    </fieldset>
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        titulo="Flujos de siniestros"
        subtitulo="Etapas de cada flujo con los documentos que se esperan, y el flujo que usa cada tipo de siniestro. Nada se borra: se desactiva."
        ayuda={<AyudaModulo guia={guia("flujos")} />}
      />
      <div className="flex flex-col gap-6">
        {flujos.map((f) => (
          <Seccion key={f.id} titulo={f.nombre} descripcion={f.descripcion ?? undefined}>
            <ul className="flex flex-col gap-2">
              {f.flujo_etapas.map((e) => (
                <li key={e.id} className="rounded-lg border border-borde">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className={e.activo ? "text-tinta" : "text-tinta-tenue line-through"}>
                        {e.orden}. {e.nombre}
                      </span>
                      <span className="text-xs text-tinta-tenue">{e.documentos_requeridos.join(", ") || "Sin documentos requeridos"}</span>
                    </summary>
                    <div className="border-t border-borde p-4">
                      <FormularioAccion accion={guardarEtapa} boton="Guardar etapa" variante="secundario" ocultos={{ id: String(e.id), id_flujo: String(f.id) }}>
                        <div className="grid gap-4 sm:grid-cols-4">
                          <Entrada nombre="nombre" etiqueta="Nombre" valor={e.nombre} className="sm:col-span-3" />
                          <Numero nombre="orden" etiqueta="Orden" valor={e.orden} entero />
                        </div>
                        <Documentos marcados={e.documentos_requeridos} />
                        <Casilla nombre="activo" etiqueta="Activa" valor={e.activo} />
                      </FormularioAccion>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
            <details className="mt-4 rounded-lg border border-dashed border-borde-fuerte p-4">
              <summary className="cursor-pointer text-sm font-medium text-tinta">Agregar etapa</summary>
              <FormularioAccion accion={guardarEtapa} boton="Agregar etapa" variante="secundario" ocultos={{ id_flujo: String(f.id) }} className="mt-4">
                <div className="grid gap-4 sm:grid-cols-4">
                  <Entrada nombre="nombre" etiqueta="Nombre" className="sm:col-span-3" />
                  <Numero nombre="orden" etiqueta="Orden" valor={(f.flujo_etapas.filter((x) => x.activo).at(-1)?.orden ?? 0) + 1} entero />
                </div>
                <Documentos marcados={[]} />
              </FormularioAccion>
            </details>
          </Seccion>
        ))}

        <Seccion titulo="Nuevo flujo">
          <FormularioAccion accion={agregarFlujo} boton="Crear flujo" variante="secundario">
            <Entrada nombre="nombre" etiqueta="Nombre" />
            <AreaTexto nombre="descripcion" etiqueta="Descripción" />
          </FormularioAccion>
        </Seccion>

        <Seccion titulo="Tipos de siniestro" descripcion="Cada tipo dice qué se afecta y qué flujo sigue. Un expediente conserva el flujo con que se abrió.">
          <ul className="flex flex-col gap-2">
            {tipos.map((t) => (
              <li key={t.id} className="rounded-lg border border-borde p-4">
                <FormularioAccion accion={guardarTipoSiniestro} boton="Guardar" variante="secundario" ocultos={{ id: String(t.id) }}>
                  <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
                    <p className={t.activo ? "text-sm font-medium text-tinta" : "text-sm text-tinta-tenue line-through"}>
                      {t.nombre}
                      <span className="block text-xs font-normal text-tinta-suave">{SUJETOS_SINIESTRO[t.sujeto as keyof typeof SUJETOS_SINIESTRO]}</span>
                    </p>
                    <Seleccion nombre="id_flujo" etiqueta="Flujo" opciones={opcionesFlujo} valor={String(t.id_flujo)} vacio={false} />
                    <Casilla nombre="activo" etiqueta="Activo" valor={t.activo} />
                  </div>
                </FormularioAccion>
              </li>
            ))}
          </ul>
          <details className="mt-4 rounded-lg border border-dashed border-borde-fuerte p-4">
            <summary className="cursor-pointer text-sm font-medium text-tinta">Agregar tipo de siniestro</summary>
            <FormularioAccion accion={guardarTipoSiniestro} boton="Agregar tipo" variante="secundario" className="mt-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Entrada nombre="nombre" etiqueta="Nombre" />
                <Seleccion nombre="sujeto" etiqueta="Qué se afecta" opciones={Object.entries(SUJETOS_SINIESTRO).map(([valor, etiqueta]) => ({ valor, etiqueta }))} />
                <Seleccion nombre="id_flujo" etiqueta="Flujo" opciones={opcionesFlujo} />
              </div>
            </FormularioAccion>
          </details>
        </Seccion>
      </div>
    </main>
  );
}
