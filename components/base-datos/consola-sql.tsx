"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Play } from "lucide-react";
import { ejecutarSql, type ResultadoSql } from "@/actions/base-datos";
import { claseBoton } from "@/components/ui/boton";
import { claseControl, MensajeEstado } from "@/components/ui/campo";
import { cn } from "@/lib/cn";

export function ConsolaSql() {
  const [sql, setSql] = useState("SELECT numero, estado, creado_en FROM cys.polizas ORDER BY id DESC LIMIT 20");
  const [escritura, setEscritura] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSql | null>(null);
  const [pendiente, iniciar] = useTransition();

  function ejecutar() {
    if (escritura && !confirm("Modo escritura: la sentencia modificará datos reales y quedará en la bitácora. ¿Continuar?")) return;
    iniciar(async () => setResultado(await ejecutarSql(sql, escritura)));
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        aria-label="Sentencia SQL"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") ejecutar();
        }}
        rows={8}
        spellCheck={false}
        className={cn(claseControl, "h-auto py-2.5 font-mono text-sm")}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-tinta-suave">
          <input type="checkbox" checked={escritura} onChange={(e) => setEscritura(e.target.checked)} className="size-4 accent-marca-600" />
          Permitir cambios (INSERT, UPDATE, DELETE…)
        </label>
        <button type="button" onClick={ejecutar} disabled={pendiente} className={cn(claseBoton("primario", "md"), "ml-auto")}>
          {pendiente ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
          Ejecutar <span className="hidden text-xs opacity-80 sm:inline">Ctrl+Enter</span>
        </button>
      </div>
      <p className="text-xs text-tinta-tenue">
        Sin «Permitir cambios» la consulta corre en solo lectura. Una sentencia por vez; máximo 15 s y 1000 filas.
      </p>

      {resultado && !resultado.ok && <MensajeEstado tipo="error">{resultado.error}</MensajeEstado>}
      {resultado?.ok && (
        <>
          <p className="text-sm text-tinta-suave">
            {resultado.columnas.length ? `${resultado.filas.length}${resultado.truncado ? "+ (limitado)" : ""} filas` : `${resultado.afectadas ?? 0} filas afectadas`} ·{" "}
            {resultado.ms} ms
          </p>
          {resultado.columnas.length > 0 && (
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-borde bg-superficie shadow-xs">
              <table className="w-full text-left font-mono text-xs">
                <thead className="sticky top-0 border-b border-borde bg-superficie-2 text-tinta-suave">
                  <tr>
                    {resultado.columnas.map((c) => (
                      <th key={c} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultado.filas.map((f, i) => (
                    <tr key={i} className="border-b border-borde last:border-0">
                      {f.map((v, j) => (
                        <td key={j} className="max-w-72 truncate px-3 py-1.5 whitespace-nowrap" title={v ?? "NULL"}>
                          {v ?? <span className="text-tinta-tenue italic">null</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
