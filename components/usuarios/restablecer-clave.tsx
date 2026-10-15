"use client";

import { useActionState, useState } from "react";
import { KeyRound, LoaderCircle, Wand2 } from "lucide-react";
import { restablecerClave, type EstadoUsuario } from "@/actions/usuarios";
import { claseBoton } from "@/components/ui/boton";
import { Campo, claseControl, MensajeEstado } from "@/components/ui/campo";
import { enviarSinReiniciar } from "@/components/ui/enviar-sin-reiniciar";
import { cn } from "@/lib/cn";
import { generarClaveTemporal } from "@/lib/usuarios/clave-temporal";

/** Asigna una clave temporal (el usuario la cambia al entrar) y quita bloqueos por intentos. */
export function RestablecerClave({ id }: { id: number }) {
  const [clave, setClave] = useState("");
  const [estado, accion, pendiente] = useActionState<EstadoUsuario, FormData>(restablecerClave, null);

  return (
    <form onSubmit={enviarSinReiniciar(accion)} noValidate>
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Nueva clave temporal" error={estado?.errores?.clave} ayuda="Mínimo 8 caracteres, con letras y números" className="min-w-56 flex-1 sm:max-w-sm">
          {(a11y) => (
            <input
              {...a11y}
              name="clave"
              autoComplete="new-password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className={cn(claseControl, "font-mono")}
            />
          )}
        </Campo>
        <div className="mb-[1.375rem] flex gap-2">
          <button type="button" onClick={() => setClave(generarClaveTemporal())} className={claseBoton("secundario", "lg")}>
            <Wand2 className="size-4" aria-hidden />
            Generar
          </button>
          <button type="submit" disabled={pendiente || !clave} className={claseBoton("primario", "lg")}>
            {pendiente ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
            Asignar
          </button>
        </div>
      </div>
      <div aria-live="polite" className="mt-2">
        {estado?.error && <MensajeEstado tipo="error">{estado.error}</MensajeEstado>}
        {estado?.ok && <MensajeEstado tipo="exito">{estado.mensaje}</MensajeEstado>}
      </div>
    </form>
  );
}
