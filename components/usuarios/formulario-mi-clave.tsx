"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { cambiarMiClave, type EstadoUsuario } from "@/actions/usuarios";
import { claseBoton } from "@/components/ui/boton";
import { Campo, claseControl, MensajeEstado } from "@/components/ui/campo";
import { enviarSinReiniciar } from "@/components/ui/enviar-sin-reiniciar";

const CAMPOS = [
  { nombre: "actual", etiqueta: "Clave actual", autocompletar: "current-password", ayuda: undefined },
  { nombre: "nueva", etiqueta: "Nueva clave", autocompletar: "new-password", ayuda: "Mínimo 8 caracteres, con letras y números" },
  { nombre: "confirmacion", etiqueta: "Repite la nueva clave", autocompletar: "new-password", ayuda: undefined },
] as const;

export function FormularioMiClave() {
  const [valores, setValores] = useState({ actual: "", nueva: "", confirmacion: "" });
  const [estado, accion, pendiente] = useActionState<EstadoUsuario, FormData>(cambiarMiClave, null);

  return (
    <form onSubmit={enviarSinReiniciar(accion)} noValidate className="flex flex-col gap-4">
      {CAMPOS.map((c) => (
        <Campo key={c.nombre} etiqueta={c.etiqueta} error={estado?.errores?.[c.nombre]} ayuda={c.ayuda}>
          {(a11y) => (
            <input
              {...a11y}
              type="password"
              name={c.nombre}
              autoComplete={c.autocompletar}
              value={valores[c.nombre]}
              onChange={(e) => setValores((v) => ({ ...v, [c.nombre]: e.target.value }))}
              className={claseControl}
            />
          )}
        </Campo>
      ))}
      <div aria-live="polite">
        {estado?.error && <MensajeEstado tipo="error">{estado.error}</MensajeEstado>}
        {estado?.ok && <MensajeEstado tipo="exito">{estado.mensaje}</MensajeEstado>}
      </div>
      <button type="submit" disabled={pendiente} className={claseBoton("primario", "lg")}>
        {pendiente ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
        Guardar clave
      </button>
    </form>
  );
}
