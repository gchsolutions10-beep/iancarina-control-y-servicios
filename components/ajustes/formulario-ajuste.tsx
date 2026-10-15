"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { guardarAjuste, type EstadoAjuste } from "@/actions/ajustes";
import { claseBoton } from "@/components/ui/boton";
import { Campo, claseControl, MensajeEstado } from "@/components/ui/campo";
import { enviarSinReiniciar } from "@/components/ui/enviar-sin-reiniciar";
import { cn } from "@/lib/cn";

type Props = { clave: string; titulo: string; detalle: string; tipo: "numero" | "texto"; valor: string | number; defecto: string | number; ejemplo?: string; editable: boolean };

export function FormularioAjuste({ clave, titulo, detalle, tipo, valor, defecto, ejemplo, editable }: Props) {
  const [estado, accion, pendiente] = useActionState<EstadoAjuste, FormData>(guardarAjuste, null);
  const ayuda = `${detalle}${defecto !== "" ? ` Por defecto: ${defecto}.` : ""}${editable ? "" : " Solo lo cambia el desarrollador."}`;
  return (
    <form onSubmit={enviarSinReiniciar(accion)} className="flex flex-col gap-2">
      <input type="hidden" name="clave" value={clave} />
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta={titulo} ayuda={ayuda} className="min-w-56 flex-1">
          {(a11y) => (
            <input
              {...a11y}
              name="valor"
              inputMode={tipo === "numero" ? "numeric" : undefined}
              defaultValue={valor}
              placeholder={ejemplo}
              disabled={!editable}
              spellCheck={false}
              className={cn(claseControl, tipo === "numero" ? "tabular-nums sm:max-w-40" : "font-mono text-sm")}
            />
          )}
        </Campo>
        {editable && (
          <button type="submit" disabled={pendiente} className={claseBoton("secundario", "lg", "mb-[1.375rem]")}>
            {pendiente ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            Guardar
          </button>
        )}
      </div>
      <div aria-live="polite">
        {estado?.error && <MensajeEstado tipo="error">{estado.error}</MensajeEstado>}
        {estado?.ok && <MensajeEstado tipo="exito">{estado.mensaje}</MensajeEstado>}
      </div>
    </form>
  );
}

