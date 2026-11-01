import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Clases de inputs/selects/textarea. Altura táctil (h-11) para tablets de planta. */
export const claseControl =
  "h-11 w-full min-w-0 rounded-lg border border-borde-fuerte bg-superficie px-3 text-[15px] text-tinta shadow-xs " +
  "placeholder:text-tinta-tenue transition-[border-color,box-shadow] duration-150 ease-suave " +
  "focus:border-marca-600 focus:outline-none focus:ring-4 focus:ring-marca-600/15 " +
  "aria-invalid:border-error " +
  "disabled:cursor-not-allowed disabled:bg-superficie-2 disabled:text-tinta-suave disabled:shadow-none";

type CampoProps = {
  etiqueta: string;
  error?: string;
  ayuda?: ReactNode;
  className?: string;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
};

/** Envuelve un control con su etiqueta, ayuda y error accesibles. */
export function Campo({ etiqueta, error, ayuda, className, children }: CampoProps) {
  const id = useId();
  const idDetalle = `${id}-detalle`;
  return (
    <div data-campo className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-tinta">
        {etiqueta}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error || ayuda ? idDetalle : undefined,
      })}
      {(error || ayuda) && (
        <p id={idDetalle} className={cn("text-xs", error ? "text-error" : "text-tinta-tenue")}>
          {error ?? ayuda}
        </p>
      )}
    </div>
  );
}

/** Valor calculado de solo lectura con la misma geometría que un control. */
export function ValorCalculado({ etiqueta, valor, ayuda }: { etiqueta: string; valor: string; ayuda?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-tinta">{etiqueta}</span>
      <output className="flex h-11 items-center rounded-lg border border-dashed border-borde-fuerte bg-superficie-2 px-3 text-[15px] font-medium tabular-nums text-tinta">
        {valor}
      </output>
      {ayuda && <p className="text-xs text-tinta-tenue">{ayuda}</p>}
    </div>
  );
}

export function MensajeEstado({ tipo, children }: { tipo: "exito" | "error"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "rounded-lg border px-3 py-2 text-sm animate-entrada",
        tipo === "exito"
          ? "border-exito/25 bg-exito/10 text-exito"
          : "border-error/25 bg-error/10 text-error",
      )}
    >
      {children}
    </p>
  );
}
