import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/dal";
import { aCsv } from "@/lib/csv";
import { contextoReporte } from "@/lib/reportes/contexto";
import { reporte } from "@/lib/reportes/definiciones";
import { filasExcel, leerValores } from "@/lib/reportes/tipos";

/** Excel (CSV en español) de un reporte con los mismos filtros de la pantalla, todas las filas. */
export async function GET(peticion: Request, { params }: RouteContext<"/reportes/[reporte]/excel">) {
  const usuario = await requerirSesion();
  const r = reporte((await params).reporte);
  if (!r) notFound();
  const ctx = await contextoReporte(usuario);
  if (ctx.empresas.length === 0) return new Response("Sin acceso", { status: 403 });
  const valores = leerValores(await r.filtros(ctx), Object.fromEntries(new URL(peticion.url).searchParams));
  const resultado = await r.consultar(ctx, valores);
  return new Response(aCsv(resultado.columnas.map((c) => c.titulo), filasExcel(resultado)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${r.id}-${ctx.hoy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
