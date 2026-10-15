import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { Indicador, TarjetasControl } from "@/components/polizas/piezas";
import { SelectFiltro, TextoFiltro } from "@/components/reportes/campo-filtro";
import { FormularioFiltros } from "@/components/reportes/formulario-filtros";
import { Paginacion } from "@/components/reportes/paginacion";
import { requerirSesion } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { enlace, leerFiltros } from "@/lib/fichas/filtros";
import { listarObligaciones, POR_PAGINA } from "@/lib/finanzas/datos";
import { formatearImporte } from "@/lib/formato";

export const metadata: Metadata = { title: "Primas por pagar" };

const BASE = "/finanzas/primas";

export default async function PrimasPorPagar({ searchParams }: PageProps<"/finanzas/primas">) {
  const usuario = await requerirSesion();
  const params = await searchParams;
  const f = await leerFiltros(usuario, params);
  if (f.opcionesEmpresa.length === 0) redirect("/sin-acceso");
  const naturaleza = params.ver === "devoluciones" ? "por_cobrar" : "por_pagar";
  const { total, conteo, pendiente, filas } = await listarObligaciones({ ...f, naturaleza });
  const varias = f.opcionesEmpresa.length > 1;
  const filtros = { q: f.q, empresa: f.empresa, estado: f.estado, ver: naturaleza === "por_cobrar" ? "devoluciones" : undefined };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        titulo={naturaleza === "por_pagar" ? "Primas por pagar" : "Devoluciones de prima por cobrar"}
        subtitulo={naturaleza === "por_pagar" ? "Obligaciones con las aseguradoras por períodos y endosos confirmados" : "Lo que las aseguradoras deben devolver por bajas"}
        ayuda={<AyudaModulo guia={guia("primas-por-pagar")} />}
        acciones={
          <Link href={enlace(BASE, { ver: naturaleza === "por_pagar" ? "devoluciones" : undefined })} className="text-sm text-marca-700 hover:underline dark:text-marca-400">
            {naturaleza === "por_pagar" ? "Ver devoluciones por cobrar →" : "← Ver primas por pagar"}
          </Link>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {pendiente.length === 0 ? (
          <Indicador etiqueta="Saldo pendiente" valor="—" />
        ) : (
          pendiente.map((x) => <Indicador key={x.moneda} etiqueta={`Saldo pendiente en ${x.moneda}`} valor={formatearImporte(x.saldo, x.moneda)} detalle="Monedas por separado: no se convierten" />)
        )}
      </div>
      <TarjetasControl
        activo={f.estado}
        enlace={(estado) => enlace(BASE, { ...filtros, estado })}
        tarjetas={[
          { valor: "vencida", etiqueta: "Vencidas", n: conteo.vencida ?? 0, tono: "baja" },
          { valor: "por_vencer", etiqueta: "Por vencer", n: conteo.por_vencer ?? 0, tono: "aviso" },
          { valor: "pendiente", etiqueta: "Pendientes", n: conteo.pendiente ?? 0 },
          { valor: "pagada", etiqueta: naturaleza === "por_pagar" ? "Pagadas" : "Cobradas", n: conteo.pagada ?? 0, tono: "ok" },
        ]}
      />
      <FormularioFiltros accion={BASE} etiqueta="Filtrar obligaciones">
        <TextoFiltro nombre="q" etiqueta="Buscar" valor={f.q} placeholder="Aseguradora, póliza o recibo" />
        {f.estado && <input type="hidden" name="estado" value={f.estado} />}
        {naturaleza === "por_cobrar" && <input type="hidden" name="ver" value="devoluciones" />}
        {varias && <SelectFiltro nombre="empresa" etiqueta="Empresa" valor={f.empresa} opciones={f.opcionesEmpresa} todos="Todas" />}
      </FormularioFiltros>
      <div className="mt-5">
        <Tabla
          columnas={["Aseguradora", "Concepto", "Vence", "Monto", "Pagado", "Saldo", ...(varias ? ["Empresa"] : []), "Estado"]}
          vacio="No hay obligaciones con estos filtros."
          filas={filas.map((o) => [
            o.aseguradora,
            <Link key="d" href={`/finanzas/primas/${o.id}`} className="text-marca-700 hover:underline dark:text-marca-400">
              {o.descripcion}
            </Link>,
            o.vencimiento,
            <span key="m" className="tabular-nums">{formatearImporte(o.monto, o.moneda)}</span>,
            <span key="i" className="tabular-nums">{formatearImporte(o.imputado)}</span>,
            <span key="s" className="tabular-nums font-medium">{formatearImporte(o.saldo)}</span>,
            ...(varias ? [f.nombreEmpresa(o.empresa)] : []),
            <span key="e" className="flex flex-wrap gap-1">
              <Insignia estado={o.estado} />
              {o.estado !== "pagada" && Number(o.imputado) > 0 && <span className="text-xs text-tinta-suave">Parcial</span>}
            </span>,
          ])}
        />
      </div>
      <div className="mt-4">
        <Paginacion pagina={f.pagina} porPagina={POR_PAGINA} total={total} enlace={(n) => enlace(BASE, { ...filtros, pagina: n })} />
      </div>
    </main>
  );
}
