import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { SeccionDocumentos } from "@/components/fichas/documentos";
import { FormularioBaja, FormularioPropiedad } from "@/components/fichas/formularios-activos";
import { Historial } from "@/components/fichas/historial";
import { SeccionPolizas } from "@/components/polizas/seccion-polizas";
import { polizasDe } from "@/lib/polizas/datos";
import { hoyPlanta } from "@/lib/tiempo";
import { Datos, Encabezado, Insignia } from "@/components/fichas/piezas";
import { SeccionTitulares } from "@/components/fichas/titulares";
import { Seccion } from "@/components/formularios/controles";
import { MensajeEstado } from "@/components/ui/campo";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { nombresEmpresas } from "@/lib/empresas";
import { documentosDe, historialDe, obtenerPropiedad, opcionesPartes, titularidades, valoresCatalogo } from "@/lib/fichas/datos";

export const metadata: Metadata = { title: "Propiedad" };

export default async function FichaPropiedad({ params, searchParams }: PageProps<"/activos/propiedades/[id]">) {
  const usuario = await requerirSesion();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await obtenerPropiedad(id) : null;
  if (!p || !tienePermiso(usuario, "seguros.ver", p.empresa)) notFound();
  const registrar = tienePermiso(usuario, "seguros.registrar", p.empresa);
  const sensibles = tienePermiso(usuario, "personas.datos_sensibles", p.empresa);
  const activa = p.estado === "activa";

  const [titulares, documentos, historial, partes, tipos, tiposDoc, nombres, polizas] = await Promise.all([
    titularidades(p.empresa, { propiedad: id }),
    documentosDe(p.empresa, { tipo: "propiedad", id }, sensibles),
    historialDe(p.empresa, "propiedades", id),
    registrar ? opcionesPartes(p.empresa) : Promise.resolve([]),
    valoresCatalogo("tipo_inmueble"),
    valoresCatalogo("tipo_documento"),
    nombresEmpresas(),
    polizasDe(p.empresa, { propiedad: id }),
  ]);
  const creada = typeof (await searchParams).creada === "string";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        volver={{ href: "/activos/propiedades", etiqueta: "Propiedades" }}
        titulo={p.nombre}
        subtitulo={`${p.tipo_inmueble ?? "Inmueble"} · ${nombres[p.empresa] ?? p.empresa}`}
        ayuda={<AyudaModulo guia={guia("propiedades")} />}
        acciones={<Insignia estado={p.estado} />}
      />
      {creada && (
        <div className="mb-4">
          <MensajeEstado tipo="exito">Propiedad creada. Registra ahora su propietario y sus fotos.</MensajeEstado>
        </div>
      )}
      {!activa && (
        <div className="mb-4">
          <MensajeEstado tipo="error">Dada de baja por {p.motivo_baja} el {p.fecha_baja}. Se conserva en el historial.</MensajeEstado>
        </div>
      )}
      <div className="flex flex-col gap-6">
        <Seccion titulo="Datos de la propiedad">
          {registrar && activa ? (
            <FormularioPropiedad p={p} tipos={tipos} />
          ) : (
            <Datos
              filas={[
                ["Tipo", p.tipo_inmueble],
                ["Dirección", p.direccion],
                ["Valor declarado", p.valor_declarado ? `${p.moneda} ${Number(p.valor_declarado).toLocaleString("es-VE", { minimumFractionDigits: 2 })}` : null],
                ["Observaciones", p.observaciones],
              ]}
            />
          )}
        </Seccion>
        <SeccionTitulares tipo="propiedad" id={id} titularidades={titulares} partes={partes} puedeRegistrar={registrar} activo={activa} />
        <SeccionDocumentos ficha={{ tipo: "propiedad", id }} documentos={documentos} puedeRegistrar={registrar} puedeConfidencial={sensibles} tipos={tiposDoc} />
        {registrar && activa && (
          <Seccion titulo="Venta o baja" descripcion="La propiedad no se borra: queda con su fecha y motivo en el historial.">
            <FormularioBaja tipo="propiedad" id={id} />
          </Seccion>
        )}
        <SeccionPolizas filas={polizas} hoy={hoyPlanta()} />
        <Historial eventos={historial} />
      </div>
    </main>
  );
}
