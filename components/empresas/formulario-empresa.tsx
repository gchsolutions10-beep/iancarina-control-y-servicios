"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { guardarEmpresa, type EstadoEmpresa } from "@/actions/empresas";
import { claseBoton } from "@/components/ui/boton";
import { Campo, claseControl, MensajeEstado } from "@/components/ui/campo";
import { enviarSinReiniciar } from "@/components/ui/enviar-sin-reiniciar";

type Empresa = { codigo: string; nombre: string; rif: string | null; orden: number; activa: boolean };

/** Alta (sin `empresa`) o edición de una empresa. El código no cambia después de crearla. */
export function FormularioEmpresa({ empresa }: { empresa?: Empresa }) {
  const [estado, accion, pendiente] = useActionState<EstadoEmpresa, FormData>(guardarEmpresa, null);
  const e = estado?.errores ?? {};
  return (
    <form onSubmit={enviarSinReiniciar(accion)} className="flex flex-col gap-3">
      {empresa && <input type="hidden" name="existente" value={empresa.codigo} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr_6rem]">
        <Campo etiqueta="Código" error={e.codigo} ayuda={empresa ? undefined : "Corto y sin espacios; no cambia después."}>
          {(a11y) => <input {...a11y} name="codigo" defaultValue={empresa?.codigo} disabled={!!empresa} spellCheck={false} className={claseControl} />}
        </Campo>
        <Campo etiqueta="Nombre" error={e.nombre}>
          {(a11y) => <input {...a11y} name="nombre" defaultValue={empresa?.nombre} className={claseControl} />}
        </Campo>
        <Campo etiqueta="RIF" error={e.rif}>
          {(a11y) => <input {...a11y} name="rif" defaultValue={empresa?.rif ?? ""} placeholder="J-12345678-9" className={claseControl} />}
        </Campo>
        <Campo etiqueta="Orden" error={e.orden}>
          {(a11y) => <input {...a11y} name="orden" inputMode="numeric" defaultValue={empresa?.orden ?? 0} className={`${claseControl} tabular-nums`} />}
        </Campo>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {empresa ? (
          <label className="flex items-center gap-2 text-sm text-tinta">
            <input type="checkbox" name="activa" defaultChecked={empresa.activa} className="size-4 accent-marca-600" />
            Activa (si la desactiva, nadie la ve, pero su información se conserva)
          </label>
        ) : (
          <span />
        )}
        <button type="submit" disabled={pendiente} className={claseBoton(empresa ? "secundario" : "primario", "lg")}>
          {pendiente ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          {empresa ? "Guardar" : "Crear empresa"}
        </button>
      </div>
      <div aria-live="polite">
        {estado?.error && <MensajeEstado tipo="error">{estado.error}</MensajeEstado>}
        {estado?.ok && <MensajeEstado tipo="exito">{estado.mensaje}</MensajeEstado>}
      </div>
    </form>
  );
}
