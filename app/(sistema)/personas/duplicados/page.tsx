import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { marcarDistintas, revertirFusion } from "@/actions/fusiones";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado, Insignia, Tabla } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";
import { BotonAccion } from "@/components/formularios/boton-accion";
import { AreaTexto, FormularioAccion } from "@/components/formularios/formulario-accion";
import { SelectFiltro } from "@/components/reportes/campo-filtro";
import { FormularioFiltros } from "@/components/reportes/formulario-filtros";
import { claseBoton } from "@/components/ui/boton";
import { requerirSesion } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { empresasDe } from "@/lib/fichas/acceso";
import { listarEmpresas } from "@/lib/empresas";
import { candidatosDuplicados, listarFusiones } from "@/lib/personas/fusion";
import { formatearInstante } from "@/lib/tiempo";

export const metadata: Metadata = { title: "Personas duplicadas" };

const enlace = "font-medium text-marca-700 hover:underline dark:text-marca-400";

/** Posibles duplicados (para comparar y fusionar) y registro de fusiones (para revertir). */
export default async function Duplicados({ searchParams }: PageProps<"/personas/duplicados">) {
  const usuario = await requerirSesion();
  const permitidas = empresasDe(usuario, "movimientos.anular");
  if (permitidas.length === 0) redirect("/sin-acceso");
  const sp = await searchParams;
  const elegida = typeof sp.empresa === "string" && permitidas.includes(sp.empresa) ? sp.empresa : "";
  const empresas = elegida ? [elegida] : permitidas;
  const [candidatos, fusiones, todas] = await Promise.all([candidatosDuplicados(empresas), listarFusiones(empresas), listarEmpresas()]);
  const nombre = Object.fromEntries(todas.map((e) => [e.codigo, e.nombre]));
  const varias = permitidas.length > 1;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        titulo="Personas duplicadas"
        subtitulo="Fichas que podrían ser la misma persona o empresa: compárelas y fusione la duplicada en la que queda."
        ayuda={<AyudaModulo guia={guia("duplicados")} />}
      />
      {varias && (
        <FormularioFiltros accion="/personas/duplicados" etiqueta="Filtrar por empresa">
          <div className="mb-5 max-w-xs">
            <SelectFiltro nombre="empresa" etiqueta="Empresa" valor={elegida} opciones={permitidas.map((c) => ({ valor: c, etiqueta: nombre[c] ?? c }))} todos="Todas" />
          </div>
        </FormularioFiltros>
      )}
      <div className="flex flex-col gap-6">
        <Seccion titulo="Posibles duplicados" descripcion="Mismo número de identificación (aunque cambie la letra) o nombre muy parecido, dentro de la misma empresa.">
          <Tabla
            columnas={["Ficha", "Ficha", "Coincidencia", ...(varias ? ["Empresa"] : []), ""]}
            vacio="No hay posibles duplicados. Si encuentra uno, abra la ficha y pulse «Fusionar con otra ficha»."
            filas={candidatos.map((c) => [
              <span key="a">
                <Link href={`/personas/${c.id_a}`} className={enlace}>{c.nombre_a}</Link>
                <span className="block text-xs text-tinta-tenue">{c.ident_a}</span>
              </span>,
              <span key="b">
                <Link href={`/personas/${c.id_b}`} className={enlace}>{c.nombre_b}</Link>
                <span className="block text-xs text-tinta-tenue">{c.ident_b}</span>
              </span>,
              c.mismo_numero ? "Mismo número de identificación" : `Nombre parecido (${Math.round(c.similitud * 100)} %)`,
              ...(varias ? [nombre[c.empresa] ?? c.empresa] : []),
              <div key="x" className="flex flex-wrap items-center gap-2">
                {/* Por defecto queda la ficha más antigua (la de menor número). */}
                <Link href={`/personas/fusionar?origen=${c.id_b}&destino=${c.id_a}`} className={claseBoton("secundario", "sm")}>
                  Comparar
                </Link>
                <BotonAccion accion={marcarDistintas} ocultos={{ a: String(c.id_a), b: String(c.id_b) }} variante="fantasma">
                  No son la misma
                </BotonAccion>
              </div>,
            ])}
          />
        </Seccion>

        <Seccion titulo="Fusiones registradas" descripcion="Cada fusión guarda los registros que movió. Al revertirla vuelven a la ficha original; lo registrado después en la que quedó se queda ahí.">
          <Tabla
            columnas={["Fecha", "Se fusionó", "En", "Registros", "Motivo", "Estado", ""]}
            vacio="Todavía no hay fusiones."
            filas={fusiones.map((f) => [
              <span key="f" className="whitespace-nowrap">
                {formatearInstante(f.fecha)}
                <span className="block text-xs text-tinta-tenue">{f.usuario}</span>
              </span>,
              <Link key="o" href={`/personas/${f.idOrigen}`} className={enlace}>{f.origen}</Link>,
              <Link key="d" href={`/personas/${f.idDestino}`} className={enlace}>{f.destino}</Link>,
              <span key="r" className="tabular-nums">{f.movidas}</span>,
              f.motivo,
              f.revertida ? (
                <span key="e">
                  <Insignia estado="revertida" />
                  <span className="mt-1 block text-xs text-tinta-tenue">
                    {formatearInstante(f.revertida.fecha)} · {f.revertida.usuario}: {f.revertida.motivo}
                  </span>
                </span>
              ) : (
                <Insignia key="e" estado="vigente" />
              ),
              f.revertida ? null : (
                <details key="v">
                  <summary className="cursor-pointer text-xs text-tinta-suave hover:text-tinta">Revertir</summary>
                  <FormularioAccion accion={revertirFusion} boton="Revertir fusión" variante="secundario" ocultos={{ id: String(f.id) }} className="mt-2 min-w-64">
                    <AreaTexto nombre="motivo" etiqueta="Motivo" />
                  </FormularioAccion>
                </details>
              ),
            ])}
          />
        </Seccion>
      </div>
    </main>
  );
}
