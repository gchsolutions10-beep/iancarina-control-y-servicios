import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { SeccionDocumentos } from "@/components/fichas/documentos";
import { FormularioParte } from "@/components/fichas/formulario-parte";
import { Historial } from "@/components/fichas/historial";
import { Datos, Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";
import { MensajeEstado } from "@/components/ui/campo";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { nombresEmpresas } from "@/lib/empresas";
import { documentosDe, historialDe, obtenerParte, titularidades, valoresCatalogo } from "@/lib/fichas/datos";
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

  const [bienes, documentos, historial, tiposId, funciones, tiposDoc, nombres] = await Promise.all([
    titularidades(empresa, { parte: id }),
    documentosDe(empresa, { tipo: "parte", id }, sensibles),
    historialDe(empresa, "partes", id),
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
          <MensajeEstado tipo="exito">Ficha creada. Ahora puedes agregar sus documentos.</MensajeEstado>
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
