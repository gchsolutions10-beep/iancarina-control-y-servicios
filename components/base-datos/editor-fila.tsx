"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { eliminarFila, guardarFila } from "@/actions/base-datos";
import { claseBoton } from "@/components/ui/boton";
import { claseControl, MensajeEstado } from "@/components/ui/campo";
import { cn } from "@/lib/cn";
import type { Columna } from "@/lib/base-datos/datos";

type Fila = Record<string, string | null>;

/** Tabla de datos con edición en un diálogo. Vacío + «nulo» marcado = NULL. */
export function TablaDatos({ tabla, columnas, filas, editable }: { tabla: string; columnas: Columna[]; filas: Fila[]; editable: boolean }) {
  const router = useRouter();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [actual, setActual] = useState<{ original: Fila | null; valores: Fila } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const pk = columnas.filter((c) => c.pk).map((c) => c.nombre);

  function abrir(fila: Fila | null) {
    setError(null);
    setActual({ original: fila, valores: fila ? { ...fila } : Object.fromEntries(columnas.map((c) => [c.nombre, null])) });
    dialogo.current?.showModal();
  }

  function ejecutar(accion: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    iniciar(async () => {
      const r = await accion();
      if (!r.ok) return setError(r.error ?? "Error");
      dialogo.current?.close();
      router.refresh();
    });
  }

  return (
    <>
      {editable && (
        <button type="button" onClick={() => abrir(null)} className={cn(claseBoton("secundario", "md"), "mb-3")}>
          <Plus className="size-4" aria-hidden />
          Nueva fila
        </button>
      )}
      <div className="overflow-x-auto rounded-xl border border-borde bg-superficie shadow-xs">
        <table className="w-full text-left font-mono text-xs">
          <thead className="border-b border-borde bg-superficie-2 text-tinta-suave">
            <tr>
              {columnas.map((c) => (
                <th key={c.nombre} scope="col" className="px-3 py-2 font-medium whitespace-nowrap" title={c.tipo}>
                  {c.nombre}
                  {c.pk && <span className="ml-1 text-marca-700 dark:text-marca-400">●</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr
                key={pk.length ? pk.map((k) => f[k]).join("/") : i}
                onClick={editable ? () => abrir(f) : undefined}
                className={cn("border-b border-borde last:border-0", editable && "cursor-pointer hover:bg-superficie-2/60")}
              >
                {columnas.map((c) => (
                  <td key={c.nombre} className="max-w-72 truncate px-3 py-1.5 whitespace-nowrap text-tinta" title={f[c.nombre] ?? "NULL"}>
                    {f[c.nombre] ?? <span className="text-tinta-tenue italic">null</span>}
                  </td>
                ))}
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={columnas.length} className="px-3 py-8 text-center font-sans text-sm text-tinta-suave">
                  Sin filas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <dialog
        ref={dialogo}
        aria-labelledby="titulo-fila"
        className="m-auto max-h-[90vh] w-[min(720px,calc(100vw-2rem))] rounded-2xl border border-borde bg-superficie p-6 text-tinta shadow-xl backdrop:bg-black/40"
      >
        {actual && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ejecutar(() => guardarFila(tabla, actual.original ? Object.fromEntries(pk.map((k) => [k, actual.original![k]])) : null, actual.valores));
            }}
          >
            <h2 id="titulo-fila" className="font-semibold">
              {actual.original ? `Editar fila · ${tabla}` : `Nueva fila · ${tabla}`}
            </h2>
            <div className="mt-4 grid gap-3">
              {columnas.map((c) => {
                const valor = actual.valores[c.nombre];
                return (
                  <label key={c.nombre} className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:items-center sm:gap-3">
                    <span className="min-w-0 text-sm">
                      <span className="font-mono font-medium">{c.nombre}</span>
                      <span className="block truncate text-xs text-tinta-tenue">
                        {c.tipo}
                        {c.pk ? " · llave" : ""}
                        {!c.nula ? " · obligatorio" : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <input
                        value={valor ?? ""}
                        placeholder={valor === null ? (c.defecto && !actual.original ? `por defecto: ${c.defecto}` : "NULL") : ""}
                        onChange={(e) => setActual((a) => a && { ...a, valores: { ...a.valores, [c.nombre]: e.target.value } })}
                        className={cn(claseControl, "h-9 font-mono text-sm")}
                      />
                      <span className="flex shrink-0 items-center gap-1 text-xs text-tinta-suave">
                        <input
                          type="checkbox"
                          aria-label={`${c.nombre} nulo`}
                          checked={valor === null}
                          onChange={(e) => setActual((a) => a && { ...a, valores: { ...a.valores, [c.nombre]: e.target.checked ? null : "" } })}
                          className="accent-marca-600"
                        />
                        nulo
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {error && (
              <div className="mt-4">
                <MensajeEstado tipo="error">{error}</MensajeEstado>
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {actual.original && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => {
                    if (confirm("¿Eliminar esta fila? Quedará una copia en la bitácora.")) {
                      ejecutar(() => eliminarFila(tabla, Object.fromEntries(pk.map((k) => [k, actual.original![k]]))));
                    }
                  }}
                  className={cn(claseBoton("fantasma", "lg"), "mr-auto text-error hover:text-error")}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Eliminar
                </button>
              )}
              <button type="button" onClick={() => dialogo.current?.close()} className={claseBoton("secundario", "lg")}>
                Cancelar
              </button>
              <button type="submit" disabled={pendiente} className={claseBoton("primario", "lg")}>
                {pendiente ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                Guardar
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
