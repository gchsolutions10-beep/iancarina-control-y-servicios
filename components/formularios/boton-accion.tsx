"use client";

import { useActionState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { claseBoton } from "@/components/ui/boton";
import { enviarSinReiniciar } from "@/components/ui/enviar-sin-reiniciar";
import type { EstadoAccion } from "@/lib/estado-accion";

/** Botón de una sola acción (quitar, calcular…) con sus campos ocultos; muestra el error al lado. */
export function BotonAccion({ accion, ocultos, children, variante = "secundario", confirmar }: {
  accion: (previo: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
  ocultos: Record<string, string>;
  children: ReactNode;
  variante?: "primario" | "secundario" | "fantasma";
  /** Pregunta antes de enviar. */
  confirmar?: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form
      onSubmit={(e) => {
        if (confirmar && !window.confirm(confirmar)) return e.preventDefault();
        enviarSinReiniciar(enviar)(e);
      }}
      className="inline-flex flex-wrap items-center gap-2"
    >
      {Object.entries(ocultos).map(([n, v]) => (
        <input key={n} type="hidden" name={n} value={v} />
      ))}
      <button type="submit" disabled={pendiente} className={claseBoton(variante, "sm")}>
        {pendiente && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
        {children}
      </button>
      <span aria-live="polite" className="text-xs empty:hidden">
        {estado?.error && <span className="text-error">{estado.error}</span>}
        {estado?.ok && estado.mensaje && <span className="text-exito">{estado.mensaje}</span>}
      </span>
    </form>
  );
}
