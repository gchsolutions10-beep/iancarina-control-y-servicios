import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado } from "@/components/fichas/piezas";
import { AccionesReporte } from "@/components/reportes/acciones-reporte";
import { SelectFiltro, TextoFiltro } from "@/components/reportes/campo-filtro";
import { EtiquetasFiltros } from "@/components/reportes/etiquetas-filtros";
import { FormularioFiltros } from "@/components/reportes/formulario-filtros";
import { ImprimirAlCargar } from "@/components/reportes/imprimir-al-cargar";
import { requerirSesion } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { enlace } from "@/lib/fichas/filtros";
import { formatearEntero, formatearImporte } from "@/lib/formato";
import { contextoReporte } from "@/lib/reportes/contexto";
import { reporte } from "@/lib/reportes/definiciones";
import { leerValores, textoFiltro, totalesPorMoneda, type TipoColumna, type Valor } from "@/lib/reportes/tipos";
import { formatearFechaISO } from "@/lib/tiempo";
import { cn } from "@/lib/cn";

/** En pantalla se muestran hasta estas filas; Excel e impresión traen todas. */
const MAXIMO_PANTALLA = 500;

export async function generateMetadata({ params }: PageProps<"/reportes/[reporte]">): Promise<Metadata> {
  return { title: reporte((await params).reporte)?.titulo ?? "Reporte" };
}

const numerica = (t: TipoColumna) => t === "importe" || t === "entero" || t === "porcentaje";

function celda(v: Valor, tipo: TipoColumna) {
  if (v === null || v === "") return "—";
  if (tipo === "importe") return formatearImporte(String(v));
  if (tipo === "entero") return formatearEntero(Number(v));
  if (tipo === "fecha") return formatearFechaISO(String(v), { dateStyle: "short" });
  return String(v);
}

export default async function PaginaReporte({ params, searchParams }: PageProps<"/reportes/[reporte]">) {
  const usuario = await requerirSesion();
  const r = reporte((await params).reporte);
  if (!r) notFound();
  const ctx = await contextoReporte(usuario);
  if (ctx.empresas.length === 0) redirect("/sin-acceso");

  const sp = await searchParams;
  const imprimir = sp.imprimir === "1";
  const filtros = await r.filtros(ctx);
  const valores = leerValores(filtros, sp);
  const resultado = await r.consultar(ctx, valores);
  const totales = totalesPorMoneda(resultado);
  const base = `/reportes/${r.id}`;
  const visibles = imprimir ? resultado.filas : resultado.filas.slice(0, MAXIMO_PANTALLA);
  const consulta = enlace("", valores);

  const etiquetas = filtros
    .filter((f) => valores[f.clave])
    .map((f) => {
      const resto = { ...valores };
      delete resto[f.clave];
      return { clave: f.clave, etiqueta: f.etiqueta, valor: textoFiltro(f, valores[f.clave]), quitar: enlace(base, resto) };
    });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 print:max-w-none print:p-0">
      {imprimir && <ImprimirAlCargar />}
      <Encabezado
        volver={imprimir ? undefined : { href: "/reportes/lista", etiqueta: "Reportes" }}
        titulo={r.titulo}
        subtitulo={r.descripcion}
        ayuda={imprimir ? undefined : <AyudaModulo guia={guia(r.id === "ceco" ? "detalle-ceco" : "reportes")} />}
        acciones={!imprimir && <AccionesReporte excel={`${base}/excel${consulta}`} imprimir={enlace(base, { ...valores, imprimir: "1" })} />}
      />

      {!imprimir && (
        <FormularioFiltros accion={base} etiqueta={`Filtrar ${r.titulo}`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {filtros.map((f) =>
              f.tipo === "lista" ? (
                <SelectFiltro key={f.clave} nombre={f.clave} etiqueta={f.etiqueta} valor={valores[f.clave] ?? ""} opciones={f.opciones} todos={f.todos} />
              ) : (
                <TextoFiltro key={f.clave} nombre={f.clave} etiqueta={f.etiqueta} valor={valores[f.clave] ?? ""} tipo={f.tipo === "fecha" ? "date" : "search"} placeholder={f.tipo === "texto" ? f.placeholder : undefined} />
              ),
            )}
          </div>
        </FormularioFiltros>
      )}
      <div className="mt-3">
        {imprimir ? (
          etiquetas.length > 0 && <p className="text-sm text-tinta-suave">Filtros: {etiquetas.map((e) => `${e.etiqueta}: ${e.valor}`).join(" · ")}</p>
        ) : (
          <EtiquetasFiltros etiquetas={etiquetas} limpiar={base} />
        )}
      </div>

      <p className="mt-4 text-sm text-tinta-suave tabular-nums">
        {resultado.filas.length === 0
          ? "Sin resultados con estos filtros."
          : `${formatearEntero(resultado.filas.length)} filas${visibles.length < resultado.filas.length ? ` (se muestran ${formatearEntero(visibles.length)}; Excel e impresión traen todas)` : ""} · al ${formatearFechaISO(ctx.hoy)}`}
      </p>

      {resultado.filas.length > 0 && (
        <div data-recorrido="tabla" className="mt-3 overflow-x-auto rounded-lg border border-borde print:overflow-visible print:border-0">
          <table className="w-full min-w-[48rem] text-left text-sm print:min-w-0 print:text-[10px]">
            <thead className="bg-superficie-2 text-xs text-tinta-suave">
              <tr>
                {resultado.columnas.map((c) => (
                  <th key={c.titulo} scope="col" className={cn("px-3 py-2 font-medium whitespace-nowrap print:px-1", numerica(c.tipo) && "text-right")}>
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {visibles.map((fila, i) => {
                const destino = !imprimir ? resultado.enlaces?.[i] : null;
                return (
                  <tr key={i} className="align-top hover:bg-superficie-2/60">
                    {fila.map((v, j) => {
                      const tipo = resultado.columnas[j].tipo;
                      const texto = celda(v, tipo);
                      return (
                        <td key={j} className={cn("px-3 py-2 text-tinta print:px-1 print:py-0.5", numerica(tipo) ? "text-right whitespace-nowrap tabular-nums" : "whitespace-nowrap print:whitespace-normal")}>
                          {j === (resultado.enlaceEn ?? 1) && destino ? (
                            <Link href={destino} className="font-medium text-marca-700 hover:underline dark:text-marca-400">
                              {texto}
                            </Link>
                          ) : (
                            texto
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            {totales.length > 0 && (
              <tfoot className="border-t-2 border-borde-fuerte bg-superficie-2/60 font-semibold">
                {totales.map((t) => (
                  <tr key={t.moneda}>
                    {resultado.columnas.map((c, j) => (
                      <td key={c.titulo} className={cn("px-3 py-2 text-tinta print:px-1", numerica(c.tipo) && "text-right whitespace-nowrap tabular-nums")}>
                        {j === 0 ? `Total ${t.moneda}` : j === resultado.moneda ? t.moneda : t.totales[j] !== null ? formatearImporte(t.totales[j]) : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>
      )}
      {totales.length > 1 && <p className="mt-2 text-xs text-tinta-tenue">Los totales se dan por moneda: el sistema nunca suma ni convierte monedas distintas.</p>}
    </main>
  );
}
