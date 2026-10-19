import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, Plus } from "lucide-react";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { TarjetasControl } from "@/components/polizas/piezas";
import { SelectFiltro, TextoFiltro } from "@/components/reportes/campo-filtro";
import { FormularioFiltros } from "@/components/reportes/formulario-filtros";
import { Paginacion } from "@/components/reportes/paginacion";
import { claseBoton } from "@/components/ui/boton";
import { requerirSesion } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { empresasDe } from "@/lib/fichas/acceso";
import { enlace, leerFiltros } from "@/lib/fichas/filtros";
import { formatearImporte } from "@/lib/formato";
import { listarSiniestros, POR_PAGINA, SUJETOS_SINIESTRO, tiposSiniestro } from "@/lib/siniestros/datos";

export const metadata: Metadata = { title: "Siniestros" };

const BASE = "/siniestros/lista";

export default async function ListaSiniestros({ searchParams }: PageProps<"/siniestros/lista">) {
  const usuario = await requerirSesion();
  const params = await searchParams;
  const f = await leerFiltros(usuario, params);
  if (f.opcionesEmpresa.length === 0) redirect("/sin-acceso");
  const sujeto = params.sujeto === "transporte" ? "transporte" : "";
  const tipo = typeof params.tipo === "string" ? params.tipo : "";
  const [{ total, conteo, dias, filas }, tipos] = await Promise.all([
    listarSiniestros({ ...f, tipo, sujeto, sensibles: empresasDe(usuario, "personas.datos_sensibles") }),
    tiposSiniestro(false),
  ]);
  const varias = f.opcionesEmpresa.length > 1;
  const filtros = { q: f.q, empresa: f.empresa, estado: f.estado, tipo, sujeto: sujeto || undefined };
  const transporte = sujeto === "transporte";

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        titulo={transporte ? "Transporte contratado" : "Siniestros"}
        subtitulo={transporte ? "Pérdidas de mercancía con transportistas externos (no los cubre la póliza propia salvo vínculo explícito)" : `${total} expedientes`}
        ayuda={<AyudaModulo guia={guia(transporte ? "transporte" : "siniestros")} />}
        acciones={
          f.empresasRegistrar.length > 0 && (
            <Link href={transporte ? "/siniestros/nuevo?sujeto=transporte" : "/siniestros/nuevo"} className={claseBoton("primario", "lg")}>
              <Plus className="size-4" aria-hidden /> Nuevo expediente
            </Link>
          )
        }
      />
      <TarjetasControl
        activo={f.estado}
        enlace={(estado) => enlace(BASE, { ...filtros, estado })}
        tarjetas={[
          { valor: "sin_movimiento", etiqueta: `Sin movimiento (+${dias} días)`, n: conteo.sin_movimiento ?? 0, tono: "baja" },
          { valor: "abierto", etiqueta: "Abiertos", n: conteo.abierto ?? 0, tono: "aviso" },
          { valor: "por_cobrar", etiqueta: "Cerrados por cobrar", n: conteo.por_cobrar ?? 0, tono: "aviso" },
          { valor: "cerrado", etiqueta: "Cerrados", n: conteo.cerrado ?? 0, tono: "ok" },
          { valor: "anulado", etiqueta: "Anulados", n: conteo.anulado ?? 0 },
        ]}
      />
      <FormularioFiltros accion={BASE} etiqueta="Filtrar siniestros">
        <TextoFiltro nombre="q" etiqueta="Buscar" valor={f.q} placeholder="Expediente, N.º aseguradora, placa o descripción" />
        {!transporte && <SelectFiltro nombre="tipo" etiqueta="Tipo" valor={tipo} opciones={tipos.map((t) => ({ valor: String(t.id), etiqueta: t.nombre }))} />}
        {f.estado && <input type="hidden" name="estado" value={f.estado} />}
        {transporte && <input type="hidden" name="sujeto" value="transporte" />}
        {varias && <SelectFiltro nombre="empresa" etiqueta="Empresa" valor={f.empresa} opciones={f.opcionesEmpresa} todos="Todas" />}
      </FormularioFiltros>
      <div className="mt-5">
        <Tabla
          columnas={["Expediente", "Fecha", "Tipo", transporte ? "Mercancía y transportista" : "Afectado", "Etapa", "Reconocido", "Por cobrar", ...(varias ? ["Empresa"] : []), "Estado"]}
          vacio="No hay expedientes con estos filtros."
          filas={filas.map((s) => [
            <Link key="n" href={`/siniestros/${s.id}`} className="font-medium whitespace-nowrap text-marca-700 hover:underline dark:text-marca-400">
              {s.numero}
            </Link>,
            s.fecha,
            <span key="t">
              {s.tipo}
              {!transporte && <span className="block text-xs text-tinta-tenue">{SUJETOS_SINIESTRO[s.sujeto]}</span>}
            </span>,
            s.afectado === "Confidencial" ? (
              <span key="a" className="inline-flex items-center gap-1 text-tinta-suave">
                <Lock className="size-3.5" aria-hidden /> Confidencial
              </span>
            ) : (
              s.afectado
            ),
            s.etapa,
            <span key="r" className="tabular-nums">{formatearImporte(s.reconocido, s.reconocido ? s.moneda : undefined)}</span>,
            <span key="c" className="tabular-nums">{formatearImporte(s.saldoPorCobrar)}</span>,
            ...(varias ? [f.nombreEmpresa(s.empresa)] : []),
            <Insignia key="e" estado={`sin_${s.estado}`} />,
          ])}
        />
      </div>
      <div className="mt-4">
        <Paginacion pagina={f.pagina} porPagina={POR_PAGINA} total={total} enlace={(n) => enlace(BASE, { ...filtros, pagina: n })} />
      </div>
    </main>
  );
}
