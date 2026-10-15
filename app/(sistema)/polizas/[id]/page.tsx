import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { guardarDescripcionPoliza } from "@/actions/polizas";
import { prepararRenovacion } from "@/actions/endosos";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { SeccionDocumentos } from "@/components/fichas/documentos";
import { Historial } from "@/components/fichas/historial";
import { Datos, Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { BotonAccion } from "@/components/formularios/boton-accion";
import { Seccion } from "@/components/formularios/controles";
import { AreaTexto, FormularioAccion } from "@/components/formularios/formulario-accion";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { nombresEmpresas } from "@/lib/empresas";
import { documentosDe, historialDe, valoresCatalogo } from "@/lib/fichas/datos";
import { formatearImporte } from "@/lib/formato";
import { obtenerPoliza } from "@/lib/polizas/datos";

export const metadata: Metadata = { title: "Póliza" };

export default async function FichaPoliza({ params }: PageProps<"/polizas/[id]">) {
  const usuario = await requerirSesion();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await obtenerPoliza(id) : null;
  if (!p || !tienePermiso(usuario, "seguros.ver", p.empresa)) notFound();
  const registrar = tienePermiso(usuario, "seguros.registrar", p.empresa);
  const sensibles = tienePermiso(usuario, "personas.datos_sensibles", p.empresa);
  const [documentos, historial, tiposDoc, nombres] = await Promise.all([
    documentosDe(p.empresa, { tipo: "poliza", id }, sensibles),
    historialDe(p.empresa, "polizas", id),
    valoresCatalogo("tipo_documento"),
    nombresEmpresas(),
  ]);
  const ultimo = p.periodos.find((x) => x.estado !== "anulado");
  const renovable = registrar && p.estado === "activa" && ultimo?.estado === "confirmado";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        volver={{ href: "/polizas/lista", etiqueta: "Pólizas" }}
        titulo={`Póliza ${p.numero}`}
        subtitulo={`${p.aseguradora} · ${p.ramo} · ${nombres[p.empresa] ?? p.empresa}`}
        ayuda={<AyudaModulo guia={guia("polizas")} />}
        acciones={ultimo && <Insignia estado={ultimo.vigencia} />}
      />
      <div className="flex flex-col gap-6">
        <Seccion titulo="Vigencias" descripcion="Cada renovación es un período nuevo; los anteriores se conservan sin cambios.">
          <Tabla
            columnas={["Período", "Vigencia", "Asegurados", "Suma asegurada", "Prima", "Estado"]}
            vacio="Sin vigencias."
            filas={p.periodos.map((x) => [
              <Link key="n" href={`/polizas/periodos/${x.id}`} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
                Período {x.numero}
              </Link>,
              `${x.desde} → ${x.hasta}`,
              x.asegurados,
              <span key="s" className="tabular-nums">{formatearImporte(x.sumaAsegurada, x.moneda)}</span>,
              <span key="p" className="tabular-nums">
                {formatearImporte(x.primaTotal, x.moneda)}
                {x.sinCalcular > 0 && <span className="block text-xs text-tinta-tenue">{x.sinCalcular} coberturas sin calcular</span>}
              </span>,
              <Insignia key="e" estado={x.vigencia} />,
            ])}
          />
          {renovable && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <BotonAccion accion={prepararRenovacion} ocultos={{ id_periodo: String(ultimo.id) }} variante="primario">
                Preparar renovación ({ultimo.hasta} en adelante)
              </BotonAccion>
              <p className="text-xs text-tinta-tenue">Copia asegurados elegibles, coberturas, partes y tarifas para revisarlos antes de confirmar.</p>
            </div>
          )}
        </Seccion>
        <Seccion titulo="Datos de la póliza">
          <Datos filas={[["Número", p.numero], ["Aseguradora", <Link key="a" href={`/personas/${p.id_aseguradora}`} className="text-marca-700 hover:underline dark:text-marca-400">{p.aseguradora}</Link>], ["Ramo", p.ramo], ["Estado", p.estado === "activa" ? "Activa" : "Cancelada"]]} />
          {registrar ? (
            <FormularioAccion accion={guardarDescripcionPoliza} ocultos={{ id: String(id) }} boton="Guardar descripción" variante="secundario" className="mt-5">
              <AreaTexto nombre="descripcion" etiqueta="Descripción" valor={p.descripcion} />
            </FormularioAccion>
          ) : (
            p.descripcion && <p className="mt-4 text-sm text-tinta">{p.descripcion}</p>
          )}
        </Seccion>
        <SeccionDocumentos ficha={{ tipo: "poliza", id }} documentos={documentos} puedeRegistrar={registrar} puedeConfidencial={sensibles} tipos={tiposDoc} />
        <Historial eventos={historial} />
      </div>
    </main>
  );
}
