import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, CircleDashed, Clock, Lock } from "lucide-react";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { SeccionDocumentos } from "@/components/fichas/documentos";
import { Historial } from "@/components/fichas/historial";
import { Datos, Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { AvisoBloqueo, Seccion } from "@/components/formularios/controles";
import { Indicador } from "@/components/polizas/piezas";
import {
  FormularioActuacion,
  FormularioAfectado,
  FormularioCierre,
  FormularioCobertura,
  FormularioCobro,
  FormularioDatosSiniestro,
  FormularioEtapa,
  FormularioImporte,
  FormularioMotivo,
} from "@/components/siniestros/formularios";
import { MensajeEstado } from "@/components/ui/campo";
import { registrarGestion } from "@/lib/auditoria";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { documentosFaltantes, TIPOS_IMPORTE } from "@/lib/dominio/siniestros";
import { nombresEmpresas } from "@/lib/empresas";
import { documentosDe, historialDe, valoresCatalogo } from "@/lib/fichas/datos";
import { formatearImporte } from "@/lib/formato";
import { opcionesSujetos } from "@/lib/polizas/datos";
import { limitesConConsumo, obligacionesSiniestro, obtenerSiniestro, opcionesCobertura, SUJETOS_SINIESTRO } from "@/lib/siniestros/datos";
import { hoyPlanta } from "@/lib/tiempo";

export const metadata: Metadata = { title: "Siniestro" };

const RUTAS = { vehiculo: "/activos/vehiculos", propiedad: "/activos/propiedades", persona: "/personas" } as const;

export default async function FichaSiniestro({ params, searchParams }: PageProps<"/siniestros/[id]">) {
  const usuario = await requerirSesion();
  const id = Number((await params).id);
  const s = Number.isInteger(id) ? await obtenerSiniestro(id) : null;
  if (!s || !tienePermiso(usuario, "seguros.ver", s.empresa)) notFound();
  const sensibles = tienePermiso(usuario, "personas.datos_sensibles", s.empresa);
  const sp = await searchParams;
  const volver = { href: s.tipo.sujeto === "transporte" ? "/siniestros/lista?sujeto=transporte" : "/siniestros/lista", etiqueta: s.tipo.sujeto === "transporte" ? "Transporte contratado" : "Siniestros" };

  if (s.confidencial && !sensibles) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <Encabezado volver={volver} titulo={s.numero} subtitulo={s.tipo.nombre} />
        <AvisoBloqueo>
          <Lock className="mr-1 inline size-4" aria-hidden /> Expediente confidencial (siniestro de persona). Solo lo ven quienes tienen el permiso «Ver datos personales» en esta empresa.
        </AvisoBloqueo>
      </main>
    );
  }
  // Consultar un expediente confidencial queda en la bitácora.
  if (s.confidencial) await registrarGestion(usuario.id, "SINIESTROS", `${s.numero} | CONSULTA del expediente confidencial`, undefined, { empresa: s.empresa, entidad: "siniestros", idRegistro: s.id, operacion: "CONSULTA" });

  const registrar = tienePermiso(usuario, "seguros.registrar", s.empresa) && s.estado !== "anulado";
  const abierto = s.estado === "abierto";
  const hoy = hoyPlanta();
  const sujetoFicha = s.tipo.sujeto === "transporte" ? null : s.tipo.sujeto;
  const [obligaciones, documentos, historial, tiposDoc, nombres, limites, sujetos, contrapartes, opcionesPorAfectado] = await Promise.all([
    obligacionesSiniestro(id),
    documentosDe(s.empresa, { tipo: "siniestro", id }, sensibles),
    historialDe(s.empresa, "siniestros", id),
    valoresCatalogo("tipo_documento"),
    nombresEmpresas(),
    s.poliza ? limitesConConsumo(BigInt(s.poliza.id_periodo)) : Promise.resolve([]),
    registrar && abierto && sujetoFicha ? opcionesSujetos(s.empresa, sujetoFicha) : Promise.resolve([]),
    registrar ? db.partes.findMany({ where: { empresa: s.empresa, tipo: "juridica", estado: "activa" }, orderBy: { razon_social: "asc" }, select: { id: true, razon_social: true, funciones: true } }) : Promise.resolve([]),
    registrar && abierto
      ? Promise.all(
          s.afectados.map((a) =>
            !a.poliza && a.tipo && a.id_sujeto
              ? opcionesCobertura(s.empresa, { [a.tipo]: BigInt(a.id_sujeto) }, s.fecha_evento)
              : Promise.resolve([]),
          ),
        )
      : Promise.resolve(s.afectados.map(() => [])),
  ]);

  const actual = s.etapas.find((e) => !e.fin);
  const faltan = actual ? documentosFaltantes(actual.documentos, s.tiposDocumento) : [];
  const cuentaMonto = obligaciones.filter((o) => o.estado === "vigente").reduce((t, o) => t + Math.round(Number(o.monto) * 100), 0) / 100;
  const pendienteDeCuenta = Math.max(0, Number(s.vigentes.reconocido ?? 0) - cuentaMonto).toFixed(2);
  const m = s.moneda;
  const etapaHecha = (id_etapa: number) => s.etapas.some((e) => e.id_etapa === id_etapa && e.fin);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        volver={volver}
        titulo={`${s.numero} · ${s.tipo.nombre}`}
        subtitulo={`${SUJETOS_SINIESTRO[s.tipo.sujeto]} · evento ${s.fecha_evento} · notificado ${s.fecha_notificacion}${s.numero_aseguradora ? ` · N.º aseguradora ${s.numero_aseguradora}` : ""} · ${nombres[s.empresa] ?? s.empresa}`}
        ayuda={<AyudaModulo guia={guia(s.tipo.sujeto === "transporte" ? "transporte" : "siniestros")} />}
        acciones={
          <span className="flex flex-wrap gap-1.5">
            {s.confidencial && (
              <span className="inline-flex items-center gap-1 rounded-full bg-superficie-2 px-2 py-0.5 text-xs font-medium text-tinta-suave">
                <Lock className="size-3.5" aria-hidden /> Confidencial
              </span>
            )}
            <Insignia estado={`sin_${s.estadoControl}`} />
          </span>
        }
      />
      <div className="mb-6 flex flex-col gap-3">
        {typeof sp.hecho === "string" && <MensajeEstado tipo="exito">{sp.hecho.slice(0, 300)}</MensajeEstado>}
        {sp.creado !== undefined && <MensajeEstado tipo="exito">Expediente abierto. Vincula la póliza que responde, registra los importes y avanza las etapas.</MensajeEstado>}
        {s.estado === "cerrado" && (
          <AvisoBloqueo>
            Cerrado el {s.cerrado_en}: {s.motivo_cierre}. {s.cobro && Number(s.cobro.saldo) > 0 ? `Queda por cobrar ${formatearImporte(s.cobro.saldo, m)}: cerrar el expediente no cierra la cuenta por cobrar.` : ""}
          </AvisoBloqueo>
        )}
        {s.estado === "anulado" && <AvisoBloqueo>Anulado: {s.motivo_cierre}. Se conserva para el historial y no consume límites.</AvisoBloqueo>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador etiqueta="Presupuestado" valor={formatearImporte(s.vigentes.presupuestado, s.vigentes.presupuestado ? m : undefined)} />
        <Indicador etiqueta="Autorizado" valor={formatearImporte(s.vigentes.autorizado, s.vigentes.autorizado ? m : undefined)} detalle="Autorizado no es pagado" />
        <Indicador etiqueta="Reconocido" valor={formatearImporte(s.vigentes.reconocido, s.vigentes.reconocido ? m : undefined)} detalle="Lo que la aseguradora reembolsa" />
        <Indicador etiqueta="Cobrado" valor={formatearImporte(s.cobro?.cobrado ?? null, s.cobro ? m : undefined)} detalle="Pagos recibidos imputados" />
        <Indicador etiqueta="Saldo por cobrar" valor={formatearImporte(s.cobro?.saldo ?? null, s.cobro ? m : undefined)} />
      </div>

      <div className="flex flex-col gap-6">
        <Seccion titulo={`Etapas · ${s.flujo}`} descripcion="Cada etapa con sus fechas. Los documentos requeridos se marcan al subirlos con ese tipo.">
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {s.etapasFlujo.map((e) => {
              const registro = [...s.etapas].reverse().find((x) => x.id_etapa === e.id);
              const enCurso = actual?.id_etapa === e.id;
              const hecha = etapaHecha(e.id);
              return (
                <li key={e.id} className={cn("rounded-lg border px-3 py-2.5 text-sm", enCurso ? "border-marca-600 ring-2 ring-marca-600/15" : "border-borde")}>
                  <p className="flex items-center gap-1.5 font-medium text-tinta">
                    {hecha ? <CircleCheck className="size-4 text-exito" aria-hidden /> : enCurso ? <Clock className="size-4 text-aviso" aria-hidden /> : <CircleDashed className="size-4 text-tinta-tenue" aria-hidden />}
                    {e.orden}. {e.nombre}
                  </p>
                  <p className="mt-0.5 text-xs text-tinta-suave">{registro ? `${registro.inicio} → ${registro.fin ?? "en curso"}` : "Pendiente"}</p>
                  {e.documentos.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-0.5 text-xs">
                      {e.documentos.map((d) => {
                        const tiene = s.tiposDocumento.some((t) => t.toLowerCase() === d.toLowerCase());
                        return (
                          <li key={d} className={tiene ? "text-exito" : "text-tinta-tenue"}>
                            {tiene ? "✓" : "○"} {d}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
          {registrar && abierto && (actual || s.etapas.length === 0) && (
            <div className="mt-5 border-t border-borde pt-5">
              <FormularioEtapa idSiniestro={id} hoy={hoy} faltan={faltan} />
            </div>
          )}
          {abierto && !actual && s.etapas.length > 0 && <p className="mt-4 text-sm text-tinta-suave">Flujo completo. Cuando el reembolso esté reconocido, cierra el expediente.</p>}
        </Seccion>

        {s.transporte ? (
          <Seccion titulo="Transporte contratado" descripcion="La mercancía viajaba con un transportista externo: no la cubre la póliza de los vehículos propios salvo que se vincule explícitamente (R15).">
            <Datos
              filas={[
                ["Transportista", <Link key="t" href={`/personas/${s.transporte.id_transportista}`} className="text-marca-700 hover:underline dark:text-marca-400">{s.transporte.transportista}</Link>],
                ["Placa", `${s.transporte.placa ?? "—"}${s.transporte.propio ? " (vehículo propio)" : ""}`],
                ["Guía", s.transporte.guia],
                ["Mercancía", s.transporte.mercancia],
                ["Valor de la mercancía", formatearImporte(s.transporte.valor, s.transporte.valor ? m : undefined)],
                ["Pérdida estimada", formatearImporte(s.transporte.perdida, s.transporte.perdida ? m : undefined)],
              ]}
            />
          </Seccion>
        ) : (
          <Seccion titulo="Afectados y póliza" descripcion="Quién o qué resultó afectado y, si corresponde, la póliza y cobertura que responde. El vínculo con la póliza siempre es explícito.">
            <Tabla
              columnas={["Afectado", "Daños", "Póliza que responde", ""]}
              vacio="Sin afectados."
              filas={s.afectados.map((a, i) => [
                a.tipo && a.id_sujeto ? (
                  <Link key="a" href={`${RUTAS[a.tipo]}/${a.id_sujeto}`} className="text-marca-700 hover:underline dark:text-marca-400">
                    {a.nombre}
                  </Link>
                ) : (
                  a.nombre
                ),
                a.danos ?? "—",
                a.poliza ? (
                  <Link key="p" href={`/polizas/periodos/${a.poliza.id_periodo}`} className="text-marca-700 hover:underline dark:text-marca-400">
                    {`Póliza ${a.poliza.numero} · período ${a.poliza.periodo}${a.cobertura ? ` · ${a.cobertura}` : ""}`}
                  </Link>
                ) : (
                  <span key="p" className="text-tinta-suave">Sin vincular</span>
                ),
                registrar && abierto && !a.poliza ? (
                  opcionesPorAfectado[i]?.length ? (
                    <details key="v">
                      <summary className="cursor-pointer text-xs text-marca-700 dark:text-marca-400">Vincular póliza</summary>
                      <div className="mt-2 min-w-72">
                        <FormularioCobertura idSiniestro={id} idAfectado={a.id} opciones={opcionesPorAfectado[i]} />
                      </div>
                    </details>
                  ) : (
                    <span key="v" className="text-xs text-tinta-tenue">Ninguna póliza confirmada lo cubría el {s.fecha_evento}</span>
                  )
                ) : null,
              ])}
            />
            {registrar && abierto && sujetoFicha && sujetos.length > 0 && (
              <details className="mt-4 rounded-lg border border-borde p-4">
                <summary className="cursor-pointer text-sm font-medium text-tinta">Agregar otro afectado</summary>
                <div className="mt-4">
                  <FormularioAfectado idSiniestro={id} sujeto={sujetoFicha} sujetos={sujetos} />
                </div>
              </details>
            )}
          </Seccion>
        )}

        {limites.length > 0 && s.poliza && (
          <Seccion titulo="Límites de la póliza" descripcion={`Consumo de los límites del período (póliza ${s.poliza.numero}) por todos sus expedientes no anulados. Se avisa al acercarse y se bloquea al superarlo.`}>
            <Tabla
              columnas={["Límite", "Monto", "Consumido", "Disponible", "Uso"]}
              vacio=""
              filas={limites.map((l) => [
                <span key="l">
                  {l.descripcion ?? (l.tipo === "agregado_anual" ? "Agregado anual" : "Por bien")}
                  <span className="block text-xs text-tinta-tenue">
                    {l.tipo === "agregado_anual" ? "Agregado anual" : "Por bien (el más usado)"} · consume {l.consume}
                    {l.cobertura ? ` · ${l.cobertura}` : ""}
                  </span>
                </span>,
                <span key="m" className="tabular-nums">{formatearImporte(l.monto, l.moneda)}</span>,
                <span key="c" className="tabular-nums">{formatearImporte(l.consumido)}</span>,
                <span key="d" className="tabular-nums">{formatearImporte(l.disponible)}</span>,
                <Insignia key="e" estado={`lim_${l.estado}`} />,
              ])}
            />
          </Seccion>
        )}

        <Seccion titulo="Importes" descripcion="Presupuestado, autorizado y reconocido. Vale el último de cada tipo; los anteriores quedan como historial y nunca se editan.">
          <Tabla
            columnas={["Fecha", "Tipo", "Monto", "Referencia", "Motivo", "Registró"]}
            vacio="Sin importes."
            filas={s.importes.map((i) => [
              i.fecha,
              TIPOS_IMPORTE[i.tipo],
              <span key="m" className="tabular-nums">{formatearImporte(i.monto, m)}</span>,
              i.referencia ?? "—",
              i.motivo ?? "—",
              i.usuario,
            ])}
          />
          {registrar && (
            <div className="mt-5 border-t border-borde pt-5">
              <FormularioImporte idSiniestro={id} hoy={hoy} moneda={m} />
            </div>
          )}
        </Seccion>

        <Seccion titulo="Cuenta por cobrar del reembolso" descripcion="Reconocido no es cobrado: el saldo baja solo con los cobros registrados en Finanzas.">
          <Tabla
            columnas={["Contraparte", "Vence", "Monto", "Cobrado", "Saldo", ""]}
            vacio={s.vigentes.reconocido ? "Todavía no se creó la cuenta por cobrar." : "Sin monto reconocido todavía."}
            filas={obligaciones.map((o) => [
              o.contraparte,
              o.vencimiento,
              <span key="m" className="tabular-nums">{formatearImporte(o.monto, m)}</span>,
              <span key="i" className="tabular-nums">{formatearImporte(o.imputado)}</span>,
              <span key="s" className="tabular-nums font-medium">{formatearImporte(o.saldo)}</span>,
              <Link key="l" href={`/finanzas/primas/${o.id}`} className="text-marca-700 hover:underline dark:text-marca-400">
                Ver y cobrar
              </Link>,
            ])}
          />
          {registrar && Number(pendienteDeCuenta) > 0 && (
            <div className="mt-5 border-t border-borde pt-5">
              <p className="mb-3 text-sm text-tinta-suave">Reconocido sin cuenta por cobrar: {formatearImporte(pendienteDeCuenta, m)}.</p>
              <FormularioCobro
                idSiniestro={id}
                contrapartes={contrapartes
                  .sort((a, b) => Number(b.funciones.includes("Aseguradora")) - Number(a.funciones.includes("Aseguradora")))
                  .map((p) => ({ valor: String(p.id), etiqueta: `${p.razon_social}${p.funciones.length ? ` (${p.funciones.join(", ")})` : ""}` }))}
                contraparte={s.poliza ? String(s.poliza.id_aseguradora) : null}
                monto={pendienteDeCuenta}
                hoy={hoy}
                moneda={m}
              />
            </div>
          )}
        </Seccion>

        <Seccion titulo="Actuaciones" descripcion="Llamadas, visitas, correos y gestiones. Mantienen el expediente «con movimiento».">
          {s.actuaciones.length === 0 ? (
            <p className="text-sm text-tinta-suave">Sin actuaciones.</p>
          ) : (
            <ol className="flex flex-col gap-3 border-l border-borde pl-4">
              {s.actuaciones.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="text-xs text-tinta-tenue">
                    {a.fecha} · {a.usuario}
                  </p>
                  <p className="mt-0.5 break-words whitespace-pre-line text-tinta">{a.descripcion}</p>
                </li>
              ))}
            </ol>
          )}
          {registrar && (
            <div className="mt-5 border-t border-borde pt-5">
              <FormularioActuacion idSiniestro={id} hoy={hoy} />
            </div>
          )}
        </Seccion>

        <SeccionDocumentos ficha={{ tipo: "siniestro", id }} documentos={documentos} puedeRegistrar={registrar} puedeConfidencial={sensibles} tipos={tiposDoc} />

        <Seccion titulo="Datos del siniestro">
          {registrar ? (
            <FormularioDatosSiniestro s={{ id, numero_aseguradora: s.numero_aseguradora, lugar: s.lugar, descripcion: s.descripcion, tipo_perdida: s.tipo_perdida, fecha_notificacion: s.fecha_notificacion }} />
          ) : (
            <Datos filas={[["Lugar", s.lugar], ["Pérdida", s.tipo_perdida], ["Qué ocurrió", s.descripcion]]} />
          )}
        </Seccion>

        {registrar && (
          <Seccion titulo={abierto ? "Cerrar expediente" : "Reabrir o anular"} descripcion="Cerrar el expediente no cierra la cuenta por cobrar: sigue en Finanzas hasta cobrarse.">
            {abierto ? <FormularioCierre idSiniestro={id} hoy={hoy} /> : <FormularioMotivo idSiniestro={id} accion="reabrir" />}
            {tienePermiso(usuario, "movimientos.anular", s.empresa) && (
              <details className="mt-5 rounded-lg border border-borde p-4">
                <summary className="cursor-pointer text-sm font-medium text-tinta">Anular (registrado por error)</summary>
                <div className="mt-4">
                  <FormularioMotivo idSiniestro={id} accion="anular" />
                </div>
              </details>
            )}
          </Seccion>
        )}
        <Historial eventos={historial} />
      </div>
    </main>
  );
}
