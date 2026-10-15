"use client";

import { useActionState } from "react";
import { alternarCatalogo } from "@/actions/catalogos";
import { enviarSinReiniciar } from "@/components/ui/enviar-sin-reiniciar";
import { cn } from "@/lib/cn";

/** Pastilla que activa o desactiva un valor de catálogo. */
export function BotonAlternar({ que, id, nombre, activo }: { que: string; id: number; nombre: string; activo: boolean }) {
  const [, enviar, pendiente] = useActionState(alternarCatalogo, null);
  return (
    <form onSubmit={enviarSinReiniciar(enviar)} className="inline">
      <input type="hidden" name="que" value={que} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="activo" value={activo ? "0" : "1"} />
      <button
        type="submit"
        disabled={pendiente}
        title={activo ? "Pulsa para desactivar" : "Pulsa para activar"}
        className={cn(
          "rounded-full border px-2.5 py-1 text-xs transition-colors",
          activo ? "border-borde-fuerte bg-superficie text-tinta hover:bg-superficie-2" : "border-dashed border-borde text-tinta-tenue line-through",
        )}
      >
        {nombre}
      </button>
    </form>
  );
}
