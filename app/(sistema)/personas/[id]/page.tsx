import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { agregarRelacion, cerrarRelacion } from "@/actions/personas";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { SeccionDocumentos } from "@/components/fichas/documentos";
import { FormularioParte } from "@/components/fichas/formulario-parte";
import { Historial } from "@/components/fichas/historial";
import { Datos, Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";
import { AreaTexto, Entrada, FormularioAccion, Numero, Seleccion } from "@/components/formularios/formulario-accion";
import { MensajeEstado } from "@/components/ui/campo";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { nombresEmpresas } from "@/lib/empresas";
import { documentosDe, historialDe, obtenerParte, relacionesDeParte, titularidades, valoresCatalogo } from "@/lib/fichas/datos";
import { enmascarar, ROLES_TITULAR } from "@/lib/validations/fichas";

export const metadata: Metadata = { title: "Ficha" };

export default async function FichaParte({ params, searchParams }: PageProps<"/personas/[id]">) {
  const usuario = await requerirSesion();
  const id = Number((await params).id);
  const bruta = Number.isInteger(id) ? await obtenerParte(id) : null;
  // Mismo «no encontrado» si no existe o es de otra empresa.
  if (!bruta || !tienePermiso(usuario, "seguros.ver", bruta.empresa)) notFound();
  const empresa = bruta.empresa;
  const registrar = tienePermiso(usuario, "seguros.registrar", empresa);
  const sensibles = tienePermiso(usuario, "personas.datos_sensibles", empresa);
  const p = enmascarar(bruta, sensibles);
  const natural = p.tipo === "natural";

  const [relaciones, bienes, documentos, historial, tiposRelacion, tiposId, funciones, tiposDoc, nombres] = await Promise.all([
    relacionesDeParte(empresa, id),
    titularidades(empresa, { parte: id }),
    documentosDe(empresa, { tipo: "parte", id }, sensibles),
    historialDe(empresa, "partes", id),
    valoresCatalogo("tipo_relacion"),
    valoresCatalogo("tipo_identificacion"),
    valoresCatalogo("funcion_organizacion"),
    valoresCatalogo("tipo_documento"),
    nombresEmpresas(),
  ]);
  const creada = typeof (await searchParams).creada === "string";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        volver={{ href: "/personas/fichas", etiqueta: "Personas" }}
        titulo={p.nombre}
        subtitulo={`${p.tipo_identificacion}-${p.numero_identificacion} · ${natural ? "Persona natural" : "Empresa u organización"} · ${nombres[empresa] ?? empresa}`}
        ayuda={<AyudaModulo guia={guia("personas")} />}
        acciones={<Insignia estado={p.estado} />}
      />
      {creada && (
        <div className="mb-4">
          <MensajeEstado tipo="exito">Ficha creada. Ahora puedes agregar sus relaciones con la empresa y sus documentos.</MensajeEstado>
        </div>
      )}
      <div className="flex flex-col gap-6">
        <Seccion titulo="Datos">
          {registrar ? (
            <FormularioParte
              valores={{ ...bruta, tipo: natural ? "natural" : "juridica", ...(sensibles ? {} : { fecha_nacimiento: null, telefono: null, correo: null, direccion: null }) }}
              tiposId={tiposId}
              funciones={funciones}
              verSensibles={sensibles}
            />
          ) : (
            <Datos
              filas={[
                ["Identificación", `${p.tipo_identificacion}-${p.numero_identificacion}`],
                ...(natural ? ([["Fecha de nacimiento", p.fecha_nacimiento]] as [string, string | null][]) : ([["Funciones", p.funciones.join(", ")]] as [string, string][])),
                ["Teléfono", p.telefono],
                ["Correo", p.correo],
                ["Dirección", p.direccion],
                ["Observaciones", p.observaciones],
              ]}
            />
          )}
        </Seccion>

        <Seccion titulo="Relación con la empresa" descripcion="Socio, accionista, propietario… Ser socio no la hace asegurada: eso se indica en cada póliza.">
          <Tabla
            columnas={["Relación", "Porcentaje", "Desde", "Hasta", "Estado", ...(registrar ? [""] : [])]}
            vacio="Sin relaciones registradas."
            filas={relaciones.map((r) => [
              r.tipo_relacion,
              r.porcentaje ? `${Number(r.porcentaje).toLocaleString("es-VE")} %` : "—",
              r.desde,
              r.hasta ?? "—",
              <Insignia key="e" estado={r.hasta ? "terminada" : "vigente"} />,
              ...(registrar
                ? [
                    r.hasta ? null : (
                      <details key="c">
                        <summary className="cursor-pointer text-xs text-tinta-suave hover:text-tinta">Terminar</summary>
                        <FormularioAccion accion={cerrarRelacion} boton="Terminar relación" variante="secundario" ocultos={{ id_relacion: String(r.id) }} className="mt-2">
                          <Entrada nombre="hasta" etiqueta="Fecha de fin" tipo="date" />
                        </FormularioAccion>
                      </details>
                    ),
                  ]
                : []),
            ])}
          />
          {registrar && (
            <details className="mt-4 rounded-lg border border-borde p-4">
              <summary className="cursor-pointer text-sm font-medium text-tinta">Agregar relación</summary>
              <FormularioAccion accion={agregarRelacion} boton="Agregar relación" ocultos={{ id_parte: String(id) }} className="mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Seleccion nombre="tipo_relacion" etiqueta="Relación" opciones={tiposRelacion} />
                  <Numero nombre="porcentaje" etiqueta="Porcentaje (opcional)" />
                  <Entrada nombre="desde" etiqueta="Desde" tipo="date" />
                  <Entrada nombre="hasta" etiqueta="Hasta (opcional)" tipo="date" />
                </div>
                <AreaTexto nombre="observaciones" etiqueta="Observaciones" />
              </FormularioAccion>
            </details>
          )}
        </Seccion>

        <Seccion titulo="Vehículos y propiedades" descripcion="Activos donde figura como propietario legal o responsable administrativo.">
          <Tabla
            columnas={["Activo", "Rol", "Desde", "Hasta"]}
            vacio="No figura como titular de ningún activo."
            filas={bienes.map((t) => [
              <Link key="a" href={t.id_vehiculo ? `/activos/vehiculos/${t.id_vehiculo}` : `/activos/propiedades/${t.id_propiedad}`} className="text-marca-700 hover:underline dark:text-marca-400">
                {t.activo}
              </Link>,
              ROLES_TITULAR[t.rol as keyof typeof ROLES_TITULAR] ?? t.rol,
              t.desde,
              t.hasta ?? "—",
            ])}
          />
        </Seccion>

        <SeccionDocumentos ficha={{ tipo: "parte", id }} documentos={documentos} puedeRegistrar={registrar} puedeConfidencial={sensibles} tipos={tiposDoc} />
        <Historial eventos={historial} />
      </div>
    </main>
  );
}
