import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { anularPago } from "@/actions/finanzas";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Historial } from "@/components/fichas/historial";
import { Datos, Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";
import { Entrada, FormularioAccion } from "@/components/formularios/formulario-accion";
import { FormularioPago } from "@/components/polizas/formularios-periodo";
import { Indicador } from "@/components/polizas/piezas";
import { MensajeEstado } from "@/components/ui/campo";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { historialDe } from "@/lib/fichas/datos";
import { obtenerObligacion } from "@/lib/finanzas/datos";
import { formatearImporte } from "@/lib/formato";
import { hoyPlanta } from "@/lib/tiempo";

export const metadata: Metadata = { title: "Prima por pagar" };

const MOVIMIENTOS: Record<string, string> = { cargo: "Cargo", aumento: "Aumento", disminucion: "Disminución", anulacion: "Anulación" };

export default async function Obligacion({ params, searchParams }: PageProps<"/finanzas/primas/[id]">) {
  const usuario = await requerirSesion();
  const id = Number((await params).id);
  const o = Number.isInteger(id) ? await obtenerObligacion(id) : null;
  if (!o || !tienePermiso(usuario, "seguros.ver", o.empresa)) notFound();
  const registrar = tienePermiso(usuario, "seguros.registrar", o.empresa);
  const anular = tienePermiso(usuario, "movimientos.anular", o.empresa);
  const historial = await historialDe(o.empresa, "obligaciones", id);
  const cobro = o.naturaleza === "por_cobrar";
  const hecho = (await searchParams).hecho;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        volver={{ href: cobro ? "/finanzas/primas?ver=cobrar" : "/finanzas/primas", etiqueta: cobro ? "Cuentas por cobrar" : "Primas por pagar" }}
        titulo={o.descripcion}
        subtitulo={`${o.aseguradora} · ${cobro ? "por cobrar" : "por pagar"} · ${o.moneda}`}
        ayuda={<AyudaModulo guia={guia("primas-por-pagar")} />}
        acciones={<Insignia estado={o.estado} />}
      />
      {typeof hecho === "string" && (
        <div className="mb-4">
          <MensajeEstado tipo="exito">{hecho.slice(0, 200)}</MensajeEstado>
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador etiqueta="Monto" valor={formatearImporte(o.monto, o.moneda)} detalle="Σ cargos y ajustes" />
        <Indicador etiqueta={cobro ? "Cobrado" : "Pagado"} valor={formatearImporte(o.imputado, o.moneda)} detalle="Σ pagos vigentes imputados" />
        <Indicador etiqueta="Saldo" valor={formatearImporte(o.saldo, o.moneda)} />
        <Indicador etiqueta="Vence" valor={o.vencimiento} detalle={`Emitida ${o.emision}`} />
      </div>
      <div className="flex flex-col gap-6">
        <Seccion titulo="Origen">
          <Datos
            filas={[
              ["Póliza", o.poliza ? <Link key="p" href={`/polizas/periodos/${o.poliza.id_periodo}`} className="text-marca-700 hover:underline dark:text-marca-400">{`${o.poliza.numero} · período ${o.poliza.periodo}`}</Link> : null],
              ["Endoso", o.endoso ? `N.º ${o.endoso}` : null],
              ["Siniestro", o.siniestro ? <Link key="s" href={`/siniestros/${o.siniestro.id}`} className="text-marca-700 hover:underline dark:text-marca-400">{o.siniestro.numero}</Link> : null],
              ["Recibo o aviso", o.documento],
              ["Aseguradora", <Link key="a" href={`/personas/${o.id_aseguradora}`} className="text-marca-700 hover:underline dark:text-marca-400">{o.aseguradora}</Link>],
            ]}
          />
          <h3 className="mt-5 mb-2 text-sm font-medium text-tinta">Movimientos de la obligación</h3>
          <Tabla columnas={["Fecha", "Tipo", "Monto", "Motivo", "Registró"]} vacio="" filas={o.movimientos.map((m) => [m.fecha, MOVIMIENTOS[m.tipo] ?? m.tipo, <span key="m" className="tabular-nums">{formatearImporte(m.monto)}</span>, m.motivo ?? "—", m.usuario])} />
        </Seccion>
        <Seccion titulo={cobro ? "Cobros" : "Pagos"} descripcion="Un pago no se borra: se anula (con permiso «Anular y ajustar») y su imputación se revierte con un registro inverso.">
          <Tabla
            columnas={["Fecha", "Monto", "Referencia", "Registró", "Estado", ""]}
            vacio={cobro ? "Sin cobros." : "Sin pagos."}
            filas={o.pagos.map((p) => [
              p.fecha,
              <span key="m" className="tabular-nums">{formatearImporte(p.monto, o.moneda)}</span>,
              p.referencia ?? "—",
              p.usuario,
              p.anulado ? (
                <span key="e">
                  <Insignia estado="anulado" />
                  <span className="block text-xs text-tinta-suave">
                    {p.anulado.por}: {p.anulado.motivo}
                  </span>
                </span>
              ) : (
                <Insignia key="e" estado="vigente" />
              ),
              anular && !p.anulado ? (
                <details key="a">
                  <summary className="cursor-pointer text-xs text-tinta-suave">Anular</summary>
                  <FormularioAccion accion={anularPago} boton="Anular pago" variante="secundario" ocultos={{ id: String(p.id), id_obligacion: String(id) }} className="mt-2">
                    <Entrada nombre="motivo" etiqueta="Motivo" />
                  </FormularioAccion>
                </details>
              ) : null,
            ])}
          />
          {registrar && o.estadoRegistro === "vigente" && Number(o.saldo) > 0 && (
            <div className="mt-5 border-t border-borde pt-5">
              <FormularioPago idObligacion={id} hoy={hoyPlanta()} saldo={o.saldo} moneda={o.moneda} cobro={cobro} />
            </div>
          )}
        </Seccion>
        <Historial eventos={historial} />
      </div>
    </main>
  );
}
