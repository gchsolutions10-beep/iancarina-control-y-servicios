import { FileText, ImageIcon, Lock } from "lucide-react";
import { retirarDocumento, subirDocumento } from "@/actions/documentos";
import { ArchivoEntrada, AreaTexto, Casilla, Entrada, FormularioAccion, Seleccion, type Opcion } from "@/components/formularios/formulario-accion";
import { Seccion } from "@/components/formularios/controles";
import type { Ficha } from "@/lib/fichas/datos";
import { formatearInstante } from "@/lib/tiempo";

type Documento = { id: number; archivo: string; nombre: string; tamano: number; esImagen: boolean; tipo: string; descripcion: string | null; fecha: string | null; confidencial: boolean; subidoPor: string; subidoEn: Date };

const kb = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);

/** Documentos y fotos de una ficha: listado con apertura controlada y, si puede registrar, carga. */
export function SeccionDocumentos({ ficha, documentos, puedeRegistrar, puedeConfidencial, tipos }: { ficha: Ficha; documentos: Documento[]; puedeRegistrar: boolean; puedeConfidencial: boolean; tipos: Opcion[] }) {
  const fotos = documentos.filter((d) => d.esImagen);
  const otros = documentos.filter((d) => !d.esImagen);
  return (
    <Seccion titulo="Documentos y fotografías" descripcion="Se abren solo desde el sistema y cada apertura de un documento queda en la bitácora.">
      {fotos.length > 0 && (
        <ul className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {fotos.map((f) => (
            <li key={f.id}>
              <a href={`/archivos/${f.archivo}`} target="_blank" rel="noopener" className="group block overflow-hidden rounded-lg border border-borde">
                {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la app */}
                <img src={`/archivos/${f.archivo}`} alt={f.descripcion ?? f.nombre} className="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" loading="lazy" />
              </a>
              <p className="mt-1 truncate text-xs text-tinta-tenue">{f.descripcion ?? f.nombre}</p>
            </li>
          ))}
        </ul>
      )}
      {otros.length > 0 ? (
        <ul className="mb-5 divide-y divide-borde rounded-lg border border-borde">
          {otros.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
              <FileText className="size-4 shrink-0 text-tinta-tenue" aria-hidden />
              <div className="min-w-0 flex-1">
                <a href={`/archivos/${d.archivo}`} target="_blank" rel="noopener" className="font-medium text-marca-700 hover:underline dark:text-marca-400">
                  {d.nombre}
                </a>
                <p className="text-xs text-tinta-tenue">
                  {d.tipo}
                  {d.fecha ? ` · ${d.fecha}` : ""} · {kb(d.tamano)} · {d.subidoPor}, {formatearInstante(d.subidoEn)}
                  {d.descripcion ? ` · ${d.descripcion}` : ""}
                </p>
              </div>
              {d.confidencial && (
                <span className="inline-flex items-center gap-1 rounded-full bg-superficie-2 px-2 py-0.5 text-xs text-tinta-suave">
                  <Lock className="size-3" aria-hidden />
                  Confidencial
                </span>
              )}
              {puedeRegistrar && (
                <details className="w-full sm:w-auto">
                  <summary className="cursor-pointer text-xs text-tinta-suave hover:text-tinta">Retirar</summary>
                  <FormularioAccion accion={retirarDocumento} boton="Retirar documento" variante="secundario" ocultos={{ id_documento: String(d.id) }} className="mt-2">
                    <Entrada nombre="motivo" etiqueta="Motivo" />
                  </FormularioAccion>
                </details>
              )}
            </li>
          ))}
        </ul>
      ) : (
        fotos.length === 0 && <p className="mb-5 text-sm text-tinta-suave">Todavía no hay documentos.</p>
      )}
      {puedeRegistrar && (
        <div className="grid gap-4 lg:grid-cols-2">
          <details className="rounded-lg border border-borde p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-tinta">
              <FileText className="size-4" aria-hidden /> Agregar documento
            </summary>
            <FormularioAccion accion={subirDocumento} boton="Subir documento" archivos ocultos={{ ficha: ficha.tipo, id_ficha: String(ficha.id) }} className="mt-4">
              <ArchivoEntrada nombre="archivo" etiqueta="Archivo" ayuda="PDF, JPG, PNG, WEBP, Word o Excel." />
              <div className="grid gap-4 sm:grid-cols-2">
                <Seleccion nombre="tipo_documento" etiqueta="Tipo" opciones={tipos} />
                <Entrada nombre="fecha_documento" etiqueta="Fecha del documento" tipo="date" />
              </div>
              <AreaTexto nombre="descripcion" etiqueta="Descripción" />
              {puedeConfidencial && <Casilla nombre="confidencial" etiqueta="Confidencial (solo lo ven quienes tienen acceso a datos personales)" />}
            </FormularioAccion>
          </details>
          <details className="rounded-lg border border-borde p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-tinta">
              <ImageIcon className="size-4" aria-hidden /> Agregar foto principal
            </summary>
            <FormularioAccion accion={subirDocumento} boton="Subir foto" archivos ocultos={{ ficha: ficha.tipo, id_ficha: String(ficha.id), foto: "1" }} className="mt-4">
              <ArchivoEntrada nombre="archivo" etiqueta="Imagen" ayuda="JPG, PNG o WEBP." soloImagen />
              <Entrada nombre="descripcion" etiqueta="Descripción" />
            </FormularioAccion>
          </details>
        </div>
      )}
    </Seccion>
  );
}
