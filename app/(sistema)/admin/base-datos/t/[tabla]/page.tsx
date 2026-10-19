import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Filter } from "lucide-react";
import { TablaDatos } from "@/components/base-datos/editor-fila";
import { claseBoton } from "@/components/ui/boton";
import { claseControl } from "@/components/ui/campo";
import { requerirPermiso } from "@/lib/auth/dal";
import { cn } from "@/lib/cn";
import { describirObjeto, FILAS_POR_PAGINA, leerFilas, SOLO_LECTURA } from "@/lib/base-datos/datos";

export const metadata: Metadata = { title: "Datos" };

export default async function DatosTabla({ params, searchParams }: PageProps<"/admin/base-datos/t/[tabla]">) {
  await requerirPermiso("admin.sistema");
  const { tabla } = await params;
  const q = await searchParams;
  const objeto = await describirObjeto(tabla);
  if (!objeto) notFound();

  const texto = (v: string | string[] | undefined) => (typeof v === "string" && v !== "" ? v : null);
  const consulta = {
    pagina: Math.max(1, Number(texto(q.pagina)) || 1),
    columna: texto(q.col),
    valor: texto(q.val),
    orden: texto(q.orden),
    desc: q.desc === "1",
  };
  const { filas, total } = await leerFilas(tabla, objeto.columnas, consulta);
  const paginas = Math.max(1, Math.ceil(total / FILAS_POR_PAGINA));
  const editable = objeto.tipo === "tabla" && objeto.columnas.some((c) => c.pk) && !SOLO_LECTURA.has(tabla);
  const enlace = (pagina: number) => {
    const p = new URLSearchParams();
    if (consulta.columna) p.set("col", consulta.columna);
    if (consulta.valor) p.set("val", consulta.valor);
    if (consulta.orden) p.set("orden", consulta.orden);
    if (consulta.desc) p.set("desc", "1");
    p.set("pagina", String(pagina));
    return `/admin/base-datos/t/${tabla}?${p}`;
  };

  return (
    <main className="mx-auto w-full max-w-[96rem] flex-1 px-4 py-6 sm:px-6">
      <Link href="/admin/base-datos/tablas" className="inline-flex items-center gap-1 rounded-md text-sm text-tinta-suave hover:text-tinta">
        <ChevronLeft className="size-4" aria-hidden />
        Tablas y vistas
      </Link>
      <header className="mt-3 mb-4">
        <h1 className="font-mono text-xl font-semibold text-tinta">cys.{tabla}</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          {objeto.tipo === "vista" ? "Vista · solo lectura" : editable ? "Tabla · clic en una fila para editarla" : SOLO_LECTURA.has(tabla) ? "Tabla · solo lectura (se gestiona desde su pantalla)" : "Tabla sin llave primaria · solo lectura"} ·{" "}
          {total.toLocaleString("es-VE")} filas
        </p>
      </header>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-tinta-suave">Columna</span>
          <select name="col" defaultValue={consulta.columna ?? ""} className={cn(claseControl, "h-9 w-44 font-mono text-sm")}>
            <option value="">—</option>
            {objeto.columnas.map((c) => (
              <option key={c.nombre}>{c.nombre}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-tinta-suave">Contiene</span>
          <input name="val" defaultValue={consulta.valor ?? ""} className={cn(claseControl, "h-9 w-48 font-mono text-sm")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-tinta-suave">Ordenar por</span>
          <select name="orden" defaultValue={consulta.orden ?? ""} className={cn(claseControl, "h-9 w-44 font-mono text-sm")}>
            <option value="">llave</option>
            {objeto.columnas.map((c) => (
              <option key={c.nombre}>{c.nombre}</option>
            ))}
          </select>
        </label>
        <label className="flex h-9 items-center gap-1.5 text-sm text-tinta-suave">
          <input type="checkbox" name="desc" value="1" defaultChecked={consulta.desc} className="accent-marca-600" />
          Descendente
        </label>
        <button type="submit" className={claseBoton("secundario", "md")}>
          <Filter className="size-4" aria-hidden />
          Aplicar
        </button>
      </form>

      <TablaDatos key={JSON.stringify(consulta)} tabla={tabla} columnas={objeto.columnas} filas={filas} editable={editable} />

      <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-3 text-sm text-tinta-suave">
        <span>
          Página {consulta.pagina} de {paginas}
        </span>
        <span className="flex gap-2">
          {consulta.pagina > 1 && (
            <Link href={enlace(consulta.pagina - 1)} className={claseBoton("secundario", "md")}>
              Anterior
            </Link>
          )}
          {consulta.pagina < paginas && (
            <Link href={enlace(consulta.pagina + 1)} className={claseBoton("secundario", "md")}>
              Siguiente
            </Link>
          )}
        </span>
      </nav>
    </main>
  );
}
