import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { Indicador } from "@/components/polizas/piezas";
import { SelectFiltro } from "@/components/reportes/campo-filtro";
import { FormularioFiltros } from "@/components/reportes/formulario-filtros";
import { GraficaBarras } from "@/components/reportes/grafica-barras";
import { requerirSesion } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { empresasDe } from "@/lib/fichas/acceso";
import { leerFiltros } from "@/lib/fichas/filtros";
import { formatearEntero, formatearImporte } from "@/lib/formato";
import { datosTablero } from "@/lib/reportes/tablero";
import { formatearFechaISO, hoyPlanta } from "@/lib/tiempo";

export const metadata: Metadata = { title: "Tablero gerencial" };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

/** Un importe por moneda, uno debajo del otro (nunca se suman monedas). */
function PorMoneda({ valores }: { valores: Record<string, string> }) {
  const lista = Object.entries(valores).sort(([a], [b]) => a.localeCompare(b));
  if (lista.length === 0) return <>—</>;
  return (
    <span className="flex flex-col">
      {lista.map(([m, v]) => (
        <span key={m}>{formatearImporte(v, m)}</span>
      ))}
    </span>
  );
}

function Tarjeta({ titulo, detalle, children }: { titulo: string; detalle?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-borde bg-superficie p-4 shadow-xs sm:p-5">
      <h2 className="font-semibold text-tinta">{titulo}</h2>
      {detalle && <p className="mt-0.5 text-xs text-tinta-tenue">{detalle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function Tablero({ searchParams }: PageProps<"/reportes/tablero">) {
  const usuario = await requerirSesion();
  const params = await searchParams;
  const f = await leerFiltros(usuario, params);
  if (f.opcionesEmpresa.length === 0) redirect("/sin-acceso");
  const hoy = hoyPlanta();
  const d = await datosTablero(f.empresas, empresasDe(usuario, "personas.datos_sensibles"), hoy, typeof params.moneda === "string" ? params.moneda : "");

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        volver={{ href: "/reportes/lista", etiqueta: "Reportes" }}
        titulo="Tablero gerencial"
        subtitulo={`Al ${formatearFechaISO(hoy)}${f.empresa ? ` · ${f.nombreEmpresa(f.empresa)}` : ""}`}
        ayuda={<AyudaModulo guia={guia("tablero")} />}
      />
      {(f.opcionesEmpresa.length > 1 || d.monedas.length > 1) && (
        <FormularioFiltros accion="/reportes/tablero" etiqueta="Filtrar el tablero">
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {f.opcionesEmpresa.length > 1 && <SelectFiltro nombre="empresa" etiqueta="Empresa" valor={f.empresa} opciones={f.opcionesEmpresa} todos="Todas" />}
            {d.monedas.length > 1 && <SelectFiltro nombre="moneda" etiqueta="Moneda de las gráficas" valor={d.moneda} opciones={d.monedas.map((m) => ({ valor: m }))} todos="Automática" />}
          </div>
        </FormularioFiltros>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador etiqueta="Pólizas vigentes" valor={formatearEntero(d.polizasVigentes)} detalle={`${formatearEntero(d.asegurados)} asegurados hoy`} />
        <Indicador etiqueta="Prima neta de las vigencias" valor={<PorMoneda valores={d.prima} />} detalle="Inicial + endosos confirmados" />
        <Indicador etiqueta="Suma asegurada vigente" valor={<PorMoneda valores={d.suma} />} />
        <Indicador etiqueta={`Reconocido en siniestros ${d.anio}`} valor={<PorMoneda valores={d.reconocido} />} detalle="Último importe reconocido de cada expediente" />
        <Indicador etiqueta="Primas por pagar" valor={<PorMoneda valores={d.porPagar} />} detalle={Object.keys(d.porPagarVencido).length ? "Incluye saldo vencido" : "Nada vencido"} />
        <Indicador etiqueta="Primas vencidas" valor={<PorMoneda valores={d.porPagarVencido} />} />
        <Indicador etiqueta="Cuentas por cobrar" valor={<PorMoneda valores={d.porCobrar} />} detalle={Object.keys(d.porCobrarVencido).length ? "Hay cobros vencidos" : "Nada vencido"} />
        <Indicador
          etiqueta="Siniestros abiertos"
          valor={formatearEntero(d.siniestrosAbiertos)}
          detalle={`${formatearEntero(d.sinMovimiento)} sin movimiento · ${formatearEntero(d.porCobrarSiniestros)} cerrados por cobrar`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo={`Prima neta por ramo${d.moneda ? ` (${d.moneda})` : ""}`} detalle="Vigencias en curso, en la moneda elegida">
          {d.primaPorRamo.length === 0 ? (
            <p className="text-sm text-tinta-suave">No hay vigencias en curso.</p>
          ) : (
            <>
              <GraficaBarras datos={d.primaPorRamo.map((r) => ({ etiqueta: r.ramo, valor: Number(r.prima) }))} descripcion={`Prima neta (${d.moneda})`} unidad={d.moneda} decimales horizontal alto={Math.max(140, d.primaPorRamo.length * 48 + 40)} />
              <div className="mt-3">
                <Tabla columnas={["Ramo", `Prima neta (${d.moneda})`]} vacio="" filas={d.primaPorRamo.map((r) => [r.ramo, <span key="p" className="tabular-nums">{formatearImporte(r.prima)}</span>])} />
              </div>
            </>
          )}
        </Tarjeta>
        <Tarjeta titulo="Siniestros por mes" detalle="Expedientes por fecha del evento, últimos 12 meses (sin anulados)">
          <GraficaBarras datos={d.siniestrosPorMes.map((m) => ({ etiqueta: mesCorto(m.mes), valor: m.n }))} descripcion="Siniestros" />
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-tinta-suave hover:text-tinta">Ver tabla</summary>
            <div className="mt-2">
              <Tabla columnas={["Mes", "Siniestros"]} vacio="" filas={d.siniestrosPorMes.map((m) => [mesCorto(m.mes), <span key="n" className="tabular-nums">{m.n}</span>])} />
            </div>
          </details>
        </Tarjeta>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Pólizas por vencer" detalle={`Vigencias que terminan en los próximos ${d.diasPoliza} días`}>
          <Tabla
            columnas={["Póliza", "Aseguradora", "Vence", "Días"]}
            vacio="Ninguna póliza vence en este plazo."
            filas={d.porVencer.map((p) => [
              <Link key="n" href={`/polizas/periodos/${p.id}`} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
                {p.numero}
                <span className="block text-xs font-normal text-tinta-tenue">{p.ramo}</span>
              </Link>,
              p.aseguradora,
              formatearFechaISO(p.hasta, { dateStyle: "short" }),
              <span key="d" className="tabular-nums">{p.dias}</span>,
            ])}
          />
          <Link href="/polizas/renovaciones" className="mt-3 inline-block text-sm font-medium text-marca-700 hover:underline dark:text-marca-400">
            Ir a Renovación anual
          </Link>
        </Tarjeta>
        <Tarjeta titulo="Primas vencidas y por vencer" detalle={`Saldos por pagar vencidos o que vencen en ${d.diasPrima} días (las 10 primeras)`}>
          <Tabla
            columnas={["Aseguradora", "Vence", "Saldo", "Estado"]}
            vacio="No hay primas vencidas ni por vencer."
            filas={d.primasProximas.map((p) => [
              <Link key="c" href={`/finanzas/primas/${p.id}`} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
                {p.contraparte}
              </Link>,
              formatearFechaISO(p.vence, { dateStyle: "short" }),
              <span key="s" className="whitespace-nowrap tabular-nums">{formatearImporte(p.saldo, p.moneda)}</span>,
              <Insignia key="e" estado={p.estado} />,
            ])}
          />
          <Link href="/reportes/obligaciones?naturaleza=por_pagar" className="mt-3 inline-block text-sm font-medium text-marca-700 hover:underline dark:text-marca-400">
            Ver el reporte de saldos
          </Link>
        </Tarjeta>
      </div>
    </main>
  );
}
