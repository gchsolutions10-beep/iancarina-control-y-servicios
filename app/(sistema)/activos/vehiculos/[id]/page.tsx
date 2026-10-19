import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { SeccionDocumentos } from "@/components/fichas/documentos";
import { FormularioBaja, FormularioVehiculo } from "@/components/fichas/formularios-activos";
import { Historial } from "@/components/fichas/historial";
import { SeccionPolizas } from "@/components/polizas/seccion-polizas";
import { polizasDe } from "@/lib/polizas/datos";
import { SeccionSiniestros } from "@/components/siniestros/seccion-siniestros";
import { siniestrosDe } from "@/lib/siniestros/datos";
import { hoyPlanta } from "@/lib/tiempo";
import { Datos, Encabezado, Insignia } from "@/components/fichas/piezas";
import { SeccionTitulares } from "@/components/fichas/titulares";
import { Seccion } from "@/components/formularios/controles";
import { MensajeEstado } from "@/components/ui/campo";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { nombresEmpresas } from "@/lib/empresas";
import { formatearTasa } from "@/lib/formato";
import { documentosDe, historialDe, modelosConMarca, obtenerVehiculo, opcionesPartes, titularidades, valoresCatalogo } from "@/lib/fichas/datos";

export const metadata: Metadata = { title: "Vehículo" };

export default async function FichaVehiculo({ params, searchParams }: PageProps<"/activos/vehiculos/[id]">) {
  const usuario = await requerirSesion();
  const id = Number((await params).id);
  const v = Number.isInteger(id) ? await obtenerVehiculo(id) : null;
  if (!v || !tienePermiso(usuario, "seguros.ver", v.empresa)) notFound();
  const registrar = tienePermiso(usuario, "seguros.registrar", v.empresa);
  const sensibles = tienePermiso(usuario, "personas.datos_sensibles", v.empresa);
  const activo = v.estado === "activo";

  const [titulares, documentos, historial, partes, modelos, colores, tipos, chutos, tiposDoc, nombres, polizas, siniestros] = await Promise.all([
    titularidades(v.empresa, { vehiculo: id }),
    documentosDe(v.empresa, { tipo: "vehiculo", id }, sensibles),
    historialDe(v.empresa, "vehiculos", id),
    registrar ? opcionesPartes(v.empresa) : Promise.resolve([]),
    modelosConMarca(),
    valoresCatalogo("color"),
    valoresCatalogo("tipo_vehiculo"),
    valoresCatalogo("clasificacion_chuto"),
    valoresCatalogo("tipo_documento"),
    nombresEmpresas(),
    polizasDe(v.empresa, { vehiculo: id }),
    siniestrosDe(v.empresa, { vehiculo: id }, sensibles),
  ]);
  const creado = typeof (await searchParams).creado === "string";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        volver={{ href: "/activos/vehiculos", etiqueta: "Vehículos" }}
        titulo={`${v.placa}${v.marcaModelo ? ` · ${v.marcaModelo}` : ""}`}
        subtitulo={`${v.origen === "propio" ? "Propio" : "De terceros"} · ${nombres[v.empresa] ?? v.empresa}`}
        ayuda={<AyudaModulo guia={guia("vehiculos")} />}
        acciones={<Insignia estado={v.estado} />}
      />
      {creado && (
        <div className="mb-4">
          <MensajeEstado tipo="exito">Vehículo creado. Registra ahora su propietario legal y sus fotos.</MensajeEstado>
        </div>
      )}
      {!activo && (
        <div className="mb-4">
          <MensajeEstado tipo="error">
            Dado de baja por {v.motivo_baja} el {v.fecha_baja}. Se conserva en el historial y no entra en futuras renovaciones.
          </MensajeEstado>
        </div>
      )}
      <div className="flex flex-col gap-6">
        <Seccion titulo="Datos del vehículo">
          {registrar && activo ? (
            <FormularioVehiculo v={v} modelos={modelos} colores={colores} tipos={tipos} chutos={chutos} />
          ) : (
            <Datos
              filas={[
                ["Placa", v.placa],
                ["Marca y modelo", v.marcaModelo],
                ["Año", v.anio],
                ["Tipo", v.tipo_vehiculo],
                ["Color", v.color],
                ["TM (toneladas métricas)", v.tm ? `${formatearTasa(v.tm)} t` : null],
                ["Clasificación de chuto", v.clasificacion_chuto],
                ["Batea", v.tiene_batea ? "Sí" : "No"],
                ["Fecha de adquisición", v.fecha_adquisicion],
                ["Observaciones", v.observaciones],
              ]}
            />
          )}
        </Seccion>
        <SeccionTitulares tipo="vehiculo" id={id} titularidades={titulares} partes={partes} puedeRegistrar={registrar} activo={activo} />
        <SeccionDocumentos ficha={{ tipo: "vehiculo", id }} documentos={documentos} puedeRegistrar={registrar} puedeConfidencial={sensibles} tipos={tiposDoc} />
        {registrar && activo && (
          <Seccion titulo="Venta o baja" descripcion="El vehículo no se borra: queda con su fecha y motivo, y se excluye de las renovaciones que empiecen después.">
            <FormularioBaja tipo="vehiculo" id={id} />
          </Seccion>
        )}
        <SeccionPolizas filas={polizas} hoy={hoyPlanta()} />
        <SeccionSiniestros filas={siniestros} />
        <Historial eventos={historial} />
      </div>
    </main>
  );
}
