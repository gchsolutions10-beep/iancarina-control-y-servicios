import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Calculator } from "lucide-react";
import { calcularPrimas, quitarAsegurado, quitarBeneficiario, quitarParte, quitarPrimaAseguradora, quitarTarifa } from "@/actions/polizas";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Historial } from "@/components/fichas/historial";
import { Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { BotonAccion } from "@/components/formularios/boton-accion";
import { AvisoBloqueo, Seccion } from "@/components/formularios/controles";
import {
  FormularioAsegurado,
  FormularioBajaAsegurado,
  FormularioBeneficiario,
  FormularioConfirmar,
  FormularioDescartar,
  FormularioParte,
  FormularioPrimaAseguradora,
  FormularioTarifa,
} from "@/components/polizas/formularios-periodo";
import { GraficaComparacion } from "@/components/polizas/grafica-comparacion";
import { FormularioLimite } from "@/components/siniestros/formularios";
import { quitarLimite } from "@/actions/siniestros";
import { limitesConConsumo } from "@/lib/siniestros/datos";
import { Indicador, MarcaPropuesta } from "@/components/polizas/piezas";
import { MensajeEstado } from "@/components/ui/campo";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { tasaPromedio, variacion } from "@/lib/dominio/calculo/motor";
import { historialDe, opcionesPartes, valoresCatalogo } from "@/lib/fichas/datos";
import { obligacionesPeriodo } from "@/lib/finanzas/datos";
import { formatearImporte, formatearPorcentaje, formatearTasa } from "@/lib/formato";
import {
  aseguradosPeriodo,
  compararPeriodos,
  endososPeriodo,
  excluidosRenovacion,
  obtenerPeriodo,
  opcionesSujetos,
  partesPeriodo,
  resumenPeriodo,
  ROLES_PERIODO,
  tarifasPeriodo,
  type Asegurado,
} from "@/lib/polizas/datos";
import { hoyPlanta } from "@/lib/tiempo";

export const metadata: Metadata = { title: "Período de póliza" };

const TIPOS_ENDOSO: Record<string, string> = { alta: "Alta", baja: "Baja", cambio_parte: "Cambio de parte", beneficiarios: "Beneficiarios" };
const RUTAS_SUJETO = { vehiculo: "/activos/vehiculos", propiedad: "/activos/propiedades", persona: "/personas" } as const;

export default async function PeriodoPoliza({ params, searchParams }: PageProps<"/polizas/periodos/[id]">) {
  const usuario = await requerirSesion();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await obtenerPeriodo(id) : null;
  if (!p || !tienePermiso(usuario, "seguros.ver", p.empresa)) notFound();
  const sp = await searchParams;
  const registrar = tienePermiso(usuario, "seguros.registrar", p.empresa);
  const borrador = p.estado === "borrador";
  const confirmado = p.estado === "confirmado";
  const editable = registrar && (borrador || confirmado);
  const hoy = hoyPlanta();

  const [partes, tarifas, asegurados, endosos, obligaciones, resumen, historial, opcPartes, sujetos, clases, comparacion, excluidos, limites] = await Promise.all([
    partesPeriodo(id),
    tarifasPeriodo(id),
    aseguradosPeriodo(id),
    endososPeriodo(id),
    obligacionesPeriodo(id),
    resumenPeriodo(BigInt(id)),
    historialDe(p.empresa, "poliza_periodos", id),
    editable ? opcionesPartes(p.empresa) : Promise.resolve([]),
    editable ? opcionesSujetos(p.empresa, p.sujeto) : Promise.resolve([]),
    valoresCatalogo("tipo_vehiculo"),
    p.anterior ? compararPeriodos(id, p.anterior.id) : Promise.resolve(null),
    p.anterior ? excluidosRenovacion(id, p.anterior.id) : Promise.resolve([]),
    limitesConConsumo(BigInt(id)),
  ]);
  const coberturas = p.coberturas.filter((c) => c.activo).map((c) => ({ valor: String(c.id), etiqueta: c.nombre }));
  const tasa = tasaPromedio(resumen.primaTotal, resumen.sumaAsegurada);
  const porPagar = obligaciones.filter((o) => o.estado === "vigente" && o.naturaleza === "por_pagar");
  const saldoPagar = porPagar.reduce((s, o) => s + Math.round(Number(o.saldo) * 100), 0) / 100;
  const m = p.moneda;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        volver={{ href: `/polizas/${p.id_poliza}`, etiqueta: `Póliza ${p.numero_poliza}` }}
        titulo={`Póliza ${p.numero_poliza} · Período ${p.numero}`}
        subtitulo={`${p.aseguradora} · ${p.ramo} · ${p.desde} → ${p.hasta} (${p.diasPeriodo} días) · ${m}`}
        ayuda={<AyudaModulo guia={guia("polizas")} />}
        acciones={<Insignia estado={p.vigencia} />}
      />

      <div className="mb-6 flex flex-col gap-3">
        {typeof sp.hecho === "string" && <MensajeEstado tipo="exito">{sp.hecho.slice(0, 300)}</MensajeEstado>}
        {sp.creada !== undefined && <MensajeEstado tipo="exito">Póliza creada. Agrega los asegurados y las tarifas, calcula y confirma.</MensajeEstado>}
        {sp.renovacion !== undefined && <MensajeEstado tipo="exito">Renovación preparada con los valores del año anterior. Revisa tarifas y valores antes de confirmar.</MensajeEstado>}
        {borrador && (
          <AvisoBloqueo>
            En preparación{p.anterior ? ` (renovación del período ${p.anterior.numero})` : ""}: nada genera primas por pagar hasta confirmar. Los cálculos se guardan como simulación.
          </AvisoBloqueo>
        )}
        {confirmado && <AvisoBloqueo>Confirmado{p.confirmado_por ? ` por ${p.confirmado_por}` : ""}. Los cambios se hacen por endoso con su fecha efectiva; lo anterior no se modifica.</AvisoBloqueo>}
        {p.estado === "anulado" && <AvisoBloqueo>Este período fue descartado. Se conserva para el historial.</AvisoBloqueo>}
        {(p.anterior || p.siguiente) && (
          <p className="flex flex-wrap gap-4 text-sm">
            {p.anterior && (
              <Link href={`/polizas/periodos/${p.anterior.id}`} className="text-marca-700 hover:underline dark:text-marca-400">
                ← Período {p.anterior.numero} ({p.anterior.desde} → {p.anterior.hasta})
              </Link>
            )}
            {p.siguiente && (
              <Link href={`/polizas/periodos/${p.siguiente.id}`} className="text-marca-700 hover:underline dark:text-marca-400">
                Período {p.siguiente.numero} ({p.siguiente.estado === "borrador" ? "en preparación" : "confirmado"}) →
              </Link>
            )}
          </p>
        )}
      </div>

      <div data-recorrido="indicadores" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador etiqueta="Asegurados vigentes" valor={resumen.asegurados} />
        <Indicador etiqueta="Suma asegurada" valor={formatearImporte(resumen.sumaAsegurada, m)} />
        <Indicador
          etiqueta="Prima del período"
          valor={formatearImporte(resumen.primaTotal, m)}
          detalle={Number(resumen.primaEndosos) !== 0 ? `Inicial ${formatearImporte(resumen.primaInicial)} · endosos ${formatearImporte(resumen.primaEndosos)}` : resumen.sinCalcular ? `${resumen.sinCalcular} coberturas sin calcular` : undefined}
        />
        <Indicador etiqueta="Tasa promedio" valor={tasa ? `${formatearTasa(tasa.toFixed(4))} %` : "—"} detalle="Ponderada: Σ primas ÷ Σ sumas aseguradas" />
        <Indicador etiqueta="Saldo por pagar" valor={confirmado || obligaciones.length ? formatearImporte(saldoPagar.toFixed(2), m) : "—"} detalle={borrador ? "Se genera al confirmar" : undefined} />
      </div>

      <div className="flex flex-col gap-6">
        <Seccion titulo="Tomador, contratante, pagador y corredor" descripcion="Roles explícitos: ser tomador no hace a nadie asegurado ni beneficiario.">
          <Tabla
            columnas={["Rol", "Persona o empresa", "Desde", "Hasta", "Endoso", ""]}
            vacio="Sin partes registradas."
            filas={partes.map((x) => [
              ROLES_PERIODO[x.rol],
              <Link key="p" href={`/personas/${x.id_parte}`} className="text-marca-700 hover:underline dark:text-marca-400">
                {x.parte}
              </Link>,
              x.desde,
              x.hasta ?? "Fin del período",
              x.endoso ? `N.º ${x.endoso}` : "—",
              borrador && registrar && x.rol !== "tomador" ? (
                <BotonAccion key="q" accion={quitarParte} ocultos={{ id_periodo: String(id), rol: x.rol }} variante="fantasma">
                  Quitar
                </BotonAccion>
              ) : null,
            ])}
          />
          {editable && (
            <details className="mt-4 rounded-lg border border-borde p-4">
              <summary className="cursor-pointer text-sm font-medium text-tinta">{confirmado ? "Cambiar tomador, pagador… (endoso)" : "Asignar o reemplazar"}</summary>
              <div className="mt-4">
                <FormularioParte idPeriodo={id} partes={opcPartes} confirmado={confirmado} hoy={hoy} />
              </div>
            </details>
          )}
        </Seccion>

        <Seccion titulo="Tarifas del período" descripcion="Tasas y primas fijas del contrato con la aseguradora. Las fórmulas (reglas de cálculo) las usan para calcular cada prima.">
          <Tabla
            columnas={["Cobertura", "Clase", "Tasa anual", "Prima fija anual", ""]}
            vacio={borrador ? "Sin tarifas: el cálculo dirá qué falta. Carga la tasa o la prima fija de cada cobertura." : "Sin tarifas."}
            filas={tarifas.map((t) => [
              t.cobertura,
              t.clase ?? "Todas",
              t.tasa ? `${formatearTasa(t.tasa)} %` : "—",
              formatearImporte(t.prima_fija, t.prima_fija ? m : undefined),
              borrador && registrar ? (
                <BotonAccion key="q" accion={quitarTarifa} ocultos={{ id_periodo: String(id), id: String(t.id) }} variante="fantasma">
                  Quitar
                </BotonAccion>
              ) : null,
            ])}
          />
          {borrador && registrar && (
            <details className="mt-4 rounded-lg border border-borde p-4">
              <summary className="cursor-pointer text-sm font-medium text-tinta">Agregar o reemplazar tarifa</summary>
              <div className="mt-4">
                <FormularioTarifa idPeriodo={id} coberturas={coberturas} clases={clases} moneda={m} />
              </div>
            </details>
          )}
        </Seccion>

        <Seccion titulo="Límites (riesgos diversos)" descripcion="Límites del contrato que consumen los siniestros vinculados a este período: aviso al acercarse y bloqueo al superarlos.">
          <Tabla
            columnas={["Límite", "Monto", "Consumido", "Disponible", "Uso", ""]}
            vacio="Sin límites configurados."
            filas={limites.map((l) => [
              <span key="l">
                {l.descripcion ?? (l.tipo === "agregado_anual" ? "Agregado anual" : "Por bien")}
                <span className="block text-xs text-tinta-tenue">
                  {l.tipo === "agregado_anual" ? "Agregado anual" : "Por bien (se muestra el más usado)"} · consume {l.consume}
                  {l.cobertura ? ` · ${l.cobertura}` : ""}
                </span>
              </span>,
              <span key="m" className="tabular-nums">{formatearImporte(l.monto, l.moneda)}</span>,
              <span key="c" className="tabular-nums">{formatearImporte(l.consumido)} ({formatearTasa(l.porcentaje)} %)</span>,
              <span key="d" className="tabular-nums">{formatearImporte(l.disponible)}</span>,
              <Insignia key="e" estado={`lim_${l.estado}`} />,
              registrar && p.estado !== "anulado" ? (
                <BotonAccion key="q" accion={quitarLimite} ocultos={{ id: String(l.id) }} variante="fantasma" confirmar="¿Desactivar este límite?">
                  Quitar
                </BotonAccion>
              ) : null,
            ])}
          />
          {registrar && p.estado !== "anulado" && (
            <details className="mt-4 rounded-lg border border-borde p-4">
              <summary className="cursor-pointer text-sm font-medium text-tinta">Agregar límite</summary>
              <div className="mt-4">
                <FormularioLimite idPeriodo={id} coberturas={coberturas} moneda={m} />
              </div>
            </details>
          )}
        </Seccion>

        <Seccion
          titulo="Asegurados y coberturas"
          descripcion="Quién o qué está asegurado, desde y hasta cuándo, con la prima de cada cobertura y la regla que la calculó."
          accion={
            borrador && registrar ? (
              <span data-recorrido="calcular">
                <BotonAccion accion={calcularPrimas} ocultos={{ id_periodo: String(id) }} variante="primario">
                  <Calculator className="size-3.5" aria-hidden /> Calcular primas
                </BotonAccion>
              </span>
            ) : undefined
          }
        >
          {asegurados.length === 0 ? (
            <p className="text-sm text-tinta-suave">Todavía no hay asegurados.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {asegurados.map((a) => (
                <FilaAsegurado key={a.id} a={a} idPeriodo={id} moneda={m} borrador={borrador} confirmado={confirmado} registrar={registrar} hoy={hoy} partes={opcPartes} sujetoPersona={p.sujeto === "persona"} />
              ))}
            </ul>
          )}
          {editable && (
            <details className="mt-4 rounded-lg border border-borde p-4">
              <summary className="cursor-pointer text-sm font-medium text-tinta">{confirmado ? "Agregar asegurado (endoso de alta)" : "Agregar asegurado"}</summary>
              <div className="mt-4">
                {sujetos.length === 0 ? (
                  <p className="text-sm text-tinta-suave">No hay fichas activas para incluir. Regístralas primero en {p.sujeto === "persona" ? "Personas" : "Activos"}.</p>
                ) : (
                  <FormularioAsegurado idPeriodo={id} sujeto={p.sujeto} sujetos={sujetos} coberturas={coberturas} clases={clases} confirmado={confirmado} desde={p.desde} hoy={hoy} moneda={m} />
                )}
              </div>
            </details>
          )}
        </Seccion>

        {borrador && registrar && (
          <Seccion titulo="Confirmar período" descripcion="Recalcula, verifica que no falte nada y genera la prima por pagar a la aseguradora. Después solo se cambia por endoso.">
            <FormularioConfirmar idPeriodo={id} vencimiento={p.desde} />
            <details className="mt-5 rounded-lg border border-borde p-4">
              <summary className="cursor-pointer text-sm font-medium text-tinta">Descartar este período</summary>
              <div className="mt-4">
                <FormularioDescartar idPeriodo={id} />
              </div>
            </details>
          </Seccion>
        )}

        {(confirmado || endosos.length > 0) && (
          <Seccion titulo="Endosos" descripcion="Altas, bajas y cambios con fecha efectiva. Prima con signo: + cobra, − devuelve.">
            <Tabla
              columnas={["N.º", "Tipo", "Fecha efectiva", "Descripción", "N.º aseguradora", "Prima", "Registró"]}
              vacio="Sin endosos."
              filas={endosos.map((e) => [
                e.numero,
                TIPOS_ENDOSO[e.tipo] ?? e.tipo,
                <span key="f">
                  {e.fecha}
                  {e.retroactivo && <span className="block text-xs text-aviso">Retroactivo</span>}
                </span>,
                <span key="d">
                  {e.descripcion}
                  {e.motivo && <span className="block text-xs text-tinta-suave">Motivo: {e.motivo}</span>}
                </span>,
                e.numero_aseguradora ?? "—",
                <span key="p" className="tabular-nums">{formatearImporte(e.prima, e.prima ? m : undefined)}</span>,
                e.usuario,
              ])}
            />
          </Seccion>
        )}

        {obligaciones.length > 0 && (
          <Seccion titulo="Primas por pagar y devoluciones" descripcion="Obligaciones generadas al confirmar el período y por cada endoso con prima. El saldo sale de los pagos imputados.">
            <Tabla
              columnas={["Concepto", "Vence", "Monto", "Pagado", "Saldo", ""]}
              vacio=""
              filas={obligaciones.map((o) => [
                `${o.concepto === "prima" ? "Prima del período" : o.concepto === "ajuste_prima" ? "Prima de endoso" : "Devolución de endoso"}${o.endoso ? ` N.º ${o.endoso}` : ""}`,
                o.vencimiento,
                <span key="m" className="tabular-nums">{formatearImporte(o.monto, o.moneda)}</span>,
                <span key="i" className="tabular-nums">{formatearImporte(o.imputado)}</span>,
                <span key="s" className="tabular-nums font-medium">{formatearImporte(o.saldo)}</span>,
                <Link key="l" href={`/finanzas/primas/${o.id}`} className="text-marca-700 hover:underline dark:text-marca-400">
                  {o.naturaleza === "por_pagar" ? "Ver y pagar" : "Ver y cobrar"}
                </Link>,
              ])}
            />
          </Seccion>
        )}

        {comparacion && p.anterior && (
          <Seccion titulo={`Comparación con el período ${p.anterior.numero}`} descripcion="Prima neta de cada período (inicial + altas − devoluciones por bajas), por cobertura y por CECO. Solo se compara la misma moneda.">
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {comparacion.indicadores.map((x) => {
                const v = x.anterior !== "—" && x.actual !== "—" ? variacion(x.actual, x.anterior) : null;
                return (
                  <Indicador
                    key={x.clave}
                    etiqueta={x.clave}
                    valor={x.clave.startsWith("Asegurados") ? x.actual : x.clave.includes("Tasa") ? `${formatearTasa(x.actual)} %` : formatearImporte(x.actual, m)}
                    detalle={`Antes: ${x.clave.startsWith("Asegurados") ? x.anterior : x.clave.includes("Tasa") ? `${formatearTasa(x.anterior)} %` : formatearImporte(x.anterior)}${v ? ` · ${formatearPorcentaje(v.toNumber())}` : ""}`}
                  />
                );
              })}
            </div>
            {comparacion.porCobertura.length > 0 && <GraficaComparacion filas={comparacion.porCobertura} moneda={m} anterior={`Período ${p.anterior.numero}`} actual={`Período ${p.numero}`} />}
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <TablaComparacion titulo="Cobertura" filas={comparacion.porCobertura} moneda={m} />
              <TablaComparacion titulo="CECO" filas={comparacion.porCeco} moneda={m} />
            </div>
            {excluidos.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-medium text-tinta">No pasaron a este período</h3>
                <Tabla columnas={["Asegurado", "Motivo"]} vacio="" filas={excluidos.map((x) => [x.sujeto, x.motivo])} />
              </div>
            )}
          </Seccion>
        )}

        <Historial eventos={historial} />
      </div>
    </main>
  );
}

function TablaComparacion({ titulo, filas, moneda }: { titulo: string; filas: { clave: string; anterior: string; actual: string }[]; moneda: string }) {
  return (
    <Tabla
      columnas={[titulo, `Anterior (${moneda})`, `Actual (${moneda})`, "Variación"]}
      vacio="Sin datos."
      filas={filas.map((f) => {
        const v = variacion(f.actual, f.anterior);
        return [f.clave, <span key="a" className="tabular-nums">{formatearImporte(f.anterior)}</span>, <span key="b" className="tabular-nums">{formatearImporte(f.actual)}</span>, v ? formatearPorcentaje(v.toNumber()) : "—"];
      })}
    />
  );
}

function FilaAsegurado({ a, idPeriodo, moneda, borrador, confirmado, registrar, hoy, partes, sujetoPersona }: {
  a: Asegurado;
  idPeriodo: number;
  moneda: string;
  borrador: boolean;
  confirmado: boolean;
  registrar: boolean;
  hoy: string;
  partes: { valor: string; etiqueta: string }[];
  sujetoPersona: boolean;
}) {
  const prima = a.coberturas.filter((c) => !c.incluida_en_padre && c.prima_periodo).reduce((s, c) => s + Math.round(Number(c.prima_periodo) * 100), 0) / 100;
  const sinCalcular = a.coberturas.some((c) => c.prima_periodo === null) || a.faltantesSuma.length > 0;
  return (
    <li className="rounded-lg border border-borde">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0">
            <span className="font-medium text-tinta">{a.sujeto}</span>
            <span className="ml-2 text-xs text-tinta-tenue">
              {a.certificado ? `Cert. ${a.certificado} · ` : ""}
              {a.ceco ? `CECO ${a.ceco} · ` : ""}
              {a.desde} → {a.hasta}
              {a.endosoAlta ? ` · alta por endoso ${a.endosoAlta}` : ""}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
            <span className="text-tinta-suave">Suma {formatearImporte(a.suma_asegurada)}</span>
            <span className="font-medium text-tinta">{formatearImporte(prima.toFixed(2), moneda)}</span>
            {a.baja ? <Insignia estado="baja" /> : sinCalcular ? <Insignia estado="pendiente" /> : null}
          </span>
        </summary>
        <div className="flex flex-col gap-4 border-t border-borde px-4 py-4">
          {a.baja && <p className="text-sm text-error">Dado de baja el {a.baja.fecha} (endoso {a.baja.numero}).</p>}
          {a.faltantesSuma.length > 0 && <p className="text-sm text-aviso">Suma asegurada sin calcular: falta {a.faltantesSuma.join(", ")}.</p>}
          <p className="text-xs text-tinta-suave">
            <Link href={`${RUTAS_SUJETO[a.tipo]}/${a.id_sujeto}`} className="text-marca-700 hover:underline dark:text-marca-400">
              Ver ficha
            </Link>
            {a.valor_bien && ` · Valor ${formatearImporte(a.valor_bien, moneda)}`}
            {a.aditamentos && ` · Aditamentos ${formatearImporte(a.aditamentos, moneda)}`}
            {a.clase_tarifa && ` · Clase ${a.clase_tarifa}`}
          </p>
          <Tabla
            columnas={["Cobertura", "Prima anual", "Prima del período", "Origen", "Regla"]}
            vacio="Sin coberturas."
            filas={a.coberturas.map((c) => [
              <span key="c">
                {c.nombre}
                {c.incluida_en_padre && <span className="block text-xs text-tinta-tenue">Incluida en otra: no suma al total</span>}
              </span>,
              <span key="a" className="tabular-nums">{formatearImporte(c.prima_anual)}</span>,
              <span key="p" className="tabular-nums">
                {c.prima_periodo ? formatearImporte(c.prima_periodo) : <span className="text-aviso">Falta: {c.faltantes.join(", ") || "calcular"}</span>}
              </span>,
              c.origen === "aseguradora" ? (
                <span key="o">
                  Aseguradora
                  <span className="block text-xs text-tinta-suave">
                    Calculada: {formatearImporte(c.prima_calculada)} · {c.motivo_ajuste}
                  </span>
                  {borrador && registrar && (
                    <BotonAccion accion={quitarPrimaAseguradora} ocultos={{ id_periodo: String(idPeriodo), id: String(c.id) }} variante="fantasma">
                      Volver al cálculo
                    </BotonAccion>
                  )}
                </span>
              ) : c.origen === "calculada" ? (
                "Calculada"
              ) : (
                "—"
              ),
              c.regla ? (
                <span key="r" className="text-xs">
                  {c.regla.replace(" (Propuesta)", "")} {c.regla.endsWith("(Propuesta)") && <MarcaPropuesta />}
                  {c.expresion && <code className="mt-0.5 block text-tinta-tenue">{c.expresion}</code>}
                </span>
              ) : (
                "—"
              ),
            ])}
          />
          {borrador && registrar && a.coberturas.length > 0 && (
            <details className="rounded-lg border border-dashed border-borde-fuerte p-3">
              <summary className="cursor-pointer text-sm text-tinta">Usar la prima que indicó la aseguradora</summary>
              <div className="mt-3 flex flex-col gap-4">
                {a.coberturas.map((c) => (
                  <div key={c.id}>
                    <p className="mb-2 text-xs font-medium text-tinta-suave">{c.nombre}</p>
                    <FormularioPrimaAseguradora idPeriodo={idPeriodo} idLinea={c.id} />
                  </div>
                ))}
              </div>
            </details>
          )}
          {(sujetoPersona || a.beneficiarios.length > 0) && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-tinta">Beneficiarios</h3>
              <Tabla
                columnas={["Persona", "Parentesco", "%", "Desde", "Hasta", ""]}
                vacio="Sin beneficiarios."
                filas={a.beneficiarios.map((b) => [
                  b.parte,
                  b.parentesco ?? "—",
                  formatearTasa(b.porcentaje),
                  b.desde,
                  b.hasta ?? "—",
                  registrar && !b.hasta && (borrador || confirmado) ? (
                    <BotonAccion key="q" accion={quitarBeneficiario} ocultos={{ id_periodo: String(idPeriodo), id: String(b.id), fecha: hoy }} variante="fantasma" confirmar={confirmado ? `Termina el ${hoy} por endoso. ¿Continuar?` : undefined}>
                      {confirmado ? "Terminar hoy" : "Quitar"}
                    </BotonAccion>
                  ) : null,
                ])}
              />
              {registrar && !a.baja && (borrador || confirmado) && (
                <details className="mt-3 rounded-lg border border-dashed border-borde-fuerte p-3">
                  <summary className="cursor-pointer text-sm text-tinta">{confirmado ? "Agregar beneficiario (endoso)" : "Agregar beneficiario"}</summary>
                  <div className="mt-3">
                    <FormularioBeneficiario idPeriodo={idPeriodo} idInclusion={a.id} partes={partes} confirmado={confirmado} hoy={hoy} />
                  </div>
                </details>
              )}
            </div>
          )}
          {registrar && (borrador || (confirmado && !a.baja)) && (
            <div className="flex flex-wrap gap-3 border-t border-borde pt-3">
              {borrador ? (
                <BotonAccion accion={quitarAsegurado} ocultos={{ id_periodo: String(idPeriodo), id: String(a.id) }} confirmar={`¿Quitar ${a.sujeto} de este período en preparación?`}>
                  Quitar del período
                </BotonAccion>
              ) : (
                <details className="w-full rounded-lg border border-dashed border-borde-fuerte p-3">
                  <summary className="cursor-pointer text-sm text-tinta">Dar de baja (endoso de baja por venta o retiro)</summary>
                  <div className="mt-3">
                    <FormularioBajaAsegurado idPeriodo={idPeriodo} idInclusion={a.id} hoy={hoy > a.desde ? hoy : a.hasta} moneda={moneda} />
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </details>
    </li>
  );
}
