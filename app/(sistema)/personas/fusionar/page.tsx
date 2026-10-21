import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftRight, ArrowRight, CircleAlert } from "lucide-react";
import { fusionarPersonas } from "@/actions/fusiones";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado, Tabla } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";
import { AreaTexto, Casilla, FormularioAccion } from "@/components/formularios/formulario-accion";
import { TextoFiltro } from "@/components/reportes/campo-filtro";
import { FormularioFiltros } from "@/components/reportes/formulario-filtros";
import { claseBoton } from "@/components/ui/boton";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { listarPartes, obtenerParte } from "@/lib/fichas/datos";
import { compararFichas } from "@/lib/personas/fusion";
import { enmascarar } from "@/lib/validations/fichas";

export const metadata: Metadata = { title: "Fusionar fichas" };

const ETIQUETAS: Record<string, string> = { fecha_nacimiento: "Fecha de nacimiento", telefono: "Teléfono", correo: "Correo", direccion: "Dirección" };
const num = (v: string | string[] | undefined) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : 0);

/**
 * Comparar dos fichas y fusionar la duplicada (origen) en la que queda (destino). Sin destino,
 * primero se busca la otra ficha. Permiso «Anular y ajustar» en la empresa.
 */
export default async function Fusionar({ searchParams }: PageProps<"/personas/fusionar">) {
  const usuario = await requerirSesion();
  const sp = await searchParams;
  const origen = num(sp.origen);
  const destino = num(sp.destino);
  const base = origen ? await obtenerParte(origen) : null;
  if (!base || !tienePermiso(usuario, "seguros.ver", base.empresa)) notFound();
  if (!tienePermiso(usuario, "movimientos.anular", base.empresa)) redirect("/sin-acceso");
  const sensibles = tienePermiso(usuario, "personas.datos_sensibles", base.empresa);

  // 1) Elegir la otra ficha
  if (!destino) {
    const q = typeof sp.q === "string" ? sp.q : "";
    const { filas } = q ? await listarPartes({ empresas: [base.empresa], q, tipo: base.tipo as "natural" | "juridica", pagina: 1 }) : { filas: [] };
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <Encabezado volver={{ href: `/personas/${origen}`, etiqueta: base.nombre }} titulo="Fusionar con otra ficha" subtitulo={`Busque la otra ficha de «${base.nombre}» (${base.tipo_identificacion}-${base.numero_identificacion}).`} ayuda={<AyudaModulo guia={guia("duplicados")} />} />
        <FormularioFiltros accion="/personas/fusionar" etiqueta="Buscar la otra ficha">
          <input type="hidden" name="origen" value={origen} />
          <TextoFiltro nombre="q" etiqueta="Nombre o identificación" valor={q} tipo="search" placeholder="Escriba y pulse Enter" />
        </FormularioFiltros>
        <div className="mt-5">
          <Tabla
            columnas={["Ficha", "Identificación", ""]}
            vacio={q ? "No hay otras fichas con esa búsqueda." : "Escriba un nombre o una identificación."}
            filas={filas
              .filter((f) => f.id !== origen)
              .map((f) => [
                f.nombre,
                `${f.tipo_identificacion}-${f.numero_identificacion}`,
                <Link key="c" href={`/personas/fusionar?origen=${origen}&destino=${f.id}`} className={claseBoton("secundario", "sm")}>
                  Comparar
                </Link>,
              ])}
          />
        </div>
      </main>
    );
  }

  // 2) Comparar y confirmar
  const c = await compararFichas(origen, destino);
  if (!c || !tienePermiso(usuario, "seguros.ver", c.destino.empresa)) notFound();
  const o = enmascarar(c.origen, sensibles);
  const d = enmascarar(c.destino, sensibles);
  const natural = c.origen.tipo === "natural";
  const filasDatos: [string, string | null, string | null][] = [
    ["Ficha N°", String(o.id), String(d.id)],
    ["Identificación", `${o.tipo_identificacion}-${o.numero_identificacion}`, `${d.tipo_identificacion}-${d.numero_identificacion}`],
    ...(natural ? [["Fecha de nacimiento", o.fecha_nacimiento, d.fecha_nacimiento] as [string, string | null, string | null]] : [["Funciones", o.funciones.join(", "), d.funciones.join(", ")] as [string, string, string]]),
    ["Teléfono", o.telefono, d.telefono],
    ["Correo", o.correo, d.correo],
    ["Dirección", o.direccion, d.direccion],
    ["Creada", c.origen.creado_en.toISOString().slice(0, 10), c.destino.creado_en.toISOString().slice(0, 10)],
  ];
  const movidas = c.refOrigen.reduce((s, r) => s + r.total, 0);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        volver={{ href: "/personas/duplicados", etiqueta: "Personas duplicadas" }}
        titulo="Fusionar fichas duplicadas"
        subtitulo="La ficha de la izquierda se fusiona en la de la derecha, que es la que queda. Nada se borra y se puede revertir."
        ayuda={<AyudaModulo guia={guia("duplicados")} />}
        acciones={
          <Link href={`/personas/fusionar?origen=${destino}&destino=${origen}`} className={claseBoton("secundario", "lg")}>
            <ArrowLeftRight className="size-4" aria-hidden /> Intercambiar
          </Link>
        }
      />
      <div className="flex flex-col gap-6">
        <Seccion titulo="Comparación">
          <div className="overflow-x-auto rounded-lg border border-borde">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-superficie-2 text-xs text-tinta-suave">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium" />
                  <th scope="col" className="px-3 py-2 font-medium">
                    Se fusiona (duplicada)
                    <Link href={`/personas/${origen}`} className="block text-sm font-semibold text-marca-700 hover:underline dark:text-marca-400">{o.nombre}</Link>
                  </th>
                  <th scope="col" className="w-8 px-1 py-2" aria-hidden><ArrowRight className="size-4 text-tinta-tenue" /></th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Queda
                    <Link href={`/personas/${destino}`} className="block text-sm font-semibold text-marca-700 hover:underline dark:text-marca-400">{d.nombre}</Link>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {filasDatos.map(([campo, a, b]) => (
                  <tr key={campo}>
                    <th scope="row" className="px-3 py-2 text-xs font-medium text-tinta-suave">{campo}</th>
                    <td className="px-3 py-2 text-tinta">{a || "—"}</td>
                    <td />
                    <td className="px-3 py-2 text-tinta">{b || "—"}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="px-3 py-2 text-xs font-medium text-tinta-suave">Registros</th>
                  <td className="px-3 py-2 align-top text-tinta">
                    {c.refOrigen.length ? c.refOrigen.map((r) => <span key={r.tabla} className="block">{r.etiqueta}: {r.total}</span>) : "Ninguno"}
                  </td>
                  <td />
                  <td className="px-3 py-2 align-top text-tinta">
                    {c.refDestino.length ? c.refDestino.map((r) => <span key={r.tabla} className="block">{r.etiqueta}: {r.total}</span>) : "Ninguno"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Seccion>

        <Seccion titulo="Qué va a pasar">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-tinta-suave">
            <li>{movidas ? `${movidas} registros de «${o.nombre}» pasan a «${d.nombre}» (pólizas, siniestros, documentos, pagos…), también los de pólizas confirmadas.` : `«${o.nombre}» no tiene registros que mover.`}</li>
            {c.completar.length > 0 && <li>«{d.nombre}» toma de la otra ficha lo que le falta: {c.completar.map((x) => ETIQUETAS[x] ?? x).join(", ")}.</li>}
            {c.funcionesNuevas.length > 0 && <li>«{d.nombre}» suma las funciones: {c.funcionesNuevas.join(", ")}.</li>}
            <li>«{o.nombre}» queda marcada «Fusionada» y se puede consultar, pero ya no se elige en formularios.</li>
            <li>Queda en el registro de fusiones y en la bitácora; se revierte desde «Personas duplicadas».</li>
          </ul>
        </Seccion>

        {c.bloqueos.length > 0 ? (
          <div role="alert" className="flex gap-3 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-tinta">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
            <div>
              <p className="font-medium">No se puede fusionar:</p>
              <ul className="mt-1 list-disc pl-5">
                {c.bloqueos.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <Seccion titulo="Confirmar">
            <FormularioAccion accion={fusionarPersonas} boton="Fusionar fichas" ocultos={{ origen: String(origen), destino: String(destino) }}>
              <AreaTexto nombre="motivo" etiqueta="Motivo" ayuda="Ej.: misma persona registrada dos veces; la cédula correcta es la de la ficha que queda." />
              <Casilla nombre="confirmo" etiqueta={`Entiendo que «${o.nombre}» se fusiona en «${d.nombre}».`} />
            </FormularioAccion>
          </Seccion>
        )}
      </div>
    </main>
  );
}
