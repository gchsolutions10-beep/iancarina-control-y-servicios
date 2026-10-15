"use client";

import { useActionState, useId } from "react";
import { AlertCircle, ArrowRight, LoaderCircle } from "lucide-react";
import { iniciarSesion } from "@/actions/auth";
import { claseBoton } from "@/components/ui/boton";
import { cn } from "@/lib/cn";
import type { EstadoInicioSesion } from "@/lib/validations/auth";

const estadoInicial: EstadoInicioSesion = {};

const claseCampo =
  "h-11 w-full rounded-lg border border-borde-fuerte bg-superficie px-3.5 text-[15px] text-tinta " +
  "placeholder:text-tinta-tenue shadow-xs transition-[border-color,box-shadow] duration-150 ease-suave " +
  "focus:border-marca-600 focus:outline-none focus:ring-4 focus:ring-marca-600/15 " +
  "aria-invalid:border-error aria-invalid:focus:ring-error/15";

export function FormularioInicioSesion({ siguiente }: { siguiente?: string }) {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, estadoInicial);
  const id = useId();

  return (
    <form action={accion} className="flex flex-col gap-5" noValidate>
      {siguiente && <input type="hidden" name="siguiente" value={siguiente} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-usuario`} className="text-sm font-medium text-tinta">
          Usuario
        </label>
        <input
          id={`${id}-usuario`}
          name="usuario"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={estado.usuario}
          aria-invalid={Boolean(estado.campos?.usuario) || undefined}
          aria-describedby={estado.campos?.usuario ? `${id}-usuario-error` : undefined}
          className={claseCampo}
        />
        {estado.campos?.usuario && (
          <p id={`${id}-usuario-error`} className="text-sm text-error">
            {estado.campos.usuario}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-clave`} className="text-sm font-medium text-tinta">
          Contraseña
        </label>
        <input
          id={`${id}-clave`}
          name="clave"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(estado.campos?.clave) || undefined}
          aria-describedby={estado.campos?.clave ? `${id}-clave-error` : undefined}
          className={claseCampo}
        />
        {estado.campos?.clave && (
          <p id={`${id}-clave-error`} className="text-sm text-error">
            {estado.campos.clave}
          </p>
        )}
      </div>

      <div aria-live="polite" className={cn("min-h-0", estado.error && "animate-entrada")}>
        {estado.error && (
          <p className="flex items-start gap-2 rounded-lg border border-marca-600/20 bg-marca-50 px-3 py-2.5 text-sm text-marca-800 dark:bg-marca-950/40 dark:text-marca-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {estado.error}
          </p>
        )}
      </div>

      <button type="submit" disabled={pendiente} className={claseBoton("primario", "lg", "w-full")}>
        {pendiente ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Verificando…
          </>
        ) : (
          <>
            Ingresar
            <ArrowRight className="size-4" aria-hidden />
          </>
        )}
      </button>
    </form>
  );
}
