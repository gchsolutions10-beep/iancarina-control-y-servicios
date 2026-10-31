"use client";

import type { ReactNode } from "react";
import { Campo, claseControl } from "@/components/ui/campo";
import { cn } from "@/lib/cn";
import { slugRecorrido } from "@/lib/ayuda/recorridos";

type Base = {
  nombre: string;
  etiqueta: string;
  valor: string;
  alCambiar: (nombre: string, valor: string) => void;
  error?: string;
  ayuda?: ReactNode;
  className?: string;
};

export function CampoTexto({ tipo = "text", ...p }: Base & { tipo?: "text" | "date" | "time"; max?: string; mayusculas?: boolean }) {
  return (
    <Campo etiqueta={p.etiqueta} error={p.error} ayuda={p.ayuda} className={p.className}>
      {(a11y) => (
        <input
          {...a11y}
          name={p.nombre}
          type={tipo}
          max={p.max}
          value={p.valor}
          onChange={(e) => p.alCambiar(p.nombre, p.mayusculas ? e.target.value.toUpperCase() : e.target.value)}
          className={claseControl}
        />
      )}
    </Campo>
  );
}

/** Número con teclado numérico; acepta coma decimal. `sufijo` muestra la unidad (%, kg). */
export function CampoNumero({ sufijo, decimales = true, ...p }: Base & { sufijo?: string; decimales?: boolean }) {
  return (
    <Campo etiqueta={p.etiqueta} error={p.error} ayuda={p.ayuda} className={p.className}>
      {(a11y) => (
        <div className="relative">
          <input
            {...a11y}
            name={p.nombre}
            inputMode={decimales ? "decimal" : "numeric"}
            autoComplete="off"
            value={p.valor}
            onChange={(e) => p.alCambiar(p.nombre, e.target.value.replace(decimales ? /[^\d.,]/g : /\D/g, ""))}
            className={cn(claseControl, "text-right tabular-nums", sufijo && (sufijo.length > 2 ? "pr-16" : "pr-10"))}
          />
          {sufijo && (
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-tinta-tenue">
              {sufijo}
            </span>
          )}
        </div>
      )}
    </Campo>
  );
}

export type OpcionSelect = { valor: string; etiqueta: string };

export function CampoSelect({ opciones, vacio = "Selecciona…", ...p }: Base & { opciones: OpcionSelect[]; vacio?: string; deshabilitado?: boolean }) {
  return (
    <Campo etiqueta={p.etiqueta} error={p.error} ayuda={p.ayuda} className={p.className}>
      {(a11y) => (
        <select
          {...a11y}
          name={p.nombre}
          value={p.valor}
          disabled={p.deshabilitado}
          onChange={(e) => p.alCambiar(p.nombre, e.target.value)}
          className={claseControl}
        >
          <option value="">{vacio}</option>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      )}
    </Campo>
  );
}

export function Seccion({ titulo, descripcion, children, accion }: { titulo: string; descripcion?: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section data-recorrido={`seccion-${slugRecorrido(titulo)}`} className="rounded-xl border border-borde bg-superficie p-5 shadow-xs sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-tinta">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-sm text-tinta-suave">{descripcion}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}

/** Aviso de por qué una sección está en solo lectura. */
export function AvisoBloqueo({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 flex items-start gap-2 rounded-lg border border-borde-fuerte bg-superficie-2 px-3 py-2.5 text-sm text-tinta-suave">
      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-tinta-tenue" />
      {children}
    </p>
  );
}
