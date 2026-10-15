"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { claseBoton } from "@/components/ui/boton";
import { Campo, claseControl, MensajeEstado } from "@/components/ui/campo";
import { enviarSinReiniciar } from "@/components/ui/enviar-sin-reiniciar";
import type { EstadoAccion } from "@/lib/estado-accion";
import { cn } from "@/lib/cn";

/**
 * Formulario genérico para Server Actions: muestra el mensaje y los errores de cada campo
 * (por nombre) sin reiniciar lo escrito. Los campos son no controlados (defaultValue).
 */
const Errores = createContext<Record<string, string | undefined>>({});

type Props = {
  accion: (previo: EstadoAccion, datos: FormData) => Promise<EstadoAccion>;
  boton?: string;
  /** Campos ocultos fijos (ids, empresa…). */
  ocultos?: Record<string, string>;
  className?: string;
  children: ReactNode;
  variante?: "primario" | "secundario";
  /** Para formularios con archivos. */
  archivos?: boolean;
  /** Varios botones (p. ej. «Simular» y «Confirmar»): cada uno envía su `nombre=valor`. Reemplaza a `boton`. */
  botones?: { nombre: string; valor: string; texto: string; variante?: "primario" | "secundario" }[];
};

export function FormularioAccion({ accion, boton = "Guardar", ocultos, className, children, variante = "primario", archivos, botones }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <form onSubmit={enviarSinReiniciar(enviar)} encType={archivos ? "multipart/form-data" : undefined} className={cn("flex flex-col gap-4", className)}>
      {ocultos && Object.entries(ocultos).map(([n, v]) => <input key={n} type="hidden" name={n} value={v} />)}
      <Errores.Provider value={estado?.errores ?? {}}>{children}</Errores.Provider>
      <div aria-live="polite" className="empty:hidden">
        {estado?.error && <MensajeEstado tipo="error">{estado.error}</MensajeEstado>}
        {estado?.aviso && <p className="rounded-lg border border-borde-fuerte bg-superficie-2 px-3 py-2 text-sm whitespace-pre-line text-tinta animate-entrada">{estado.aviso}</p>}
        {estado?.ok && estado.mensaje && <MensajeEstado tipo="exito">{estado.mensaje}</MensajeEstado>}
      </div>
      <div className="flex flex-wrap gap-2">
        {botones ? (
          botones.map((b) => (
            <button key={b.valor} type="submit" name={b.nombre} value={b.valor} disabled={pendiente} className={claseBoton(b.variante ?? "primario", "lg")}>
              {pendiente && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {b.texto}
            </button>
          ))
        ) : (
          <button type="submit" disabled={pendiente} className={claseBoton(variante, "lg")}>
            {pendiente ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
            {boton}
          </button>
        )}
      </div>
    </form>
  );
}

type Base = { nombre: string; etiqueta: string; ayuda?: ReactNode; className?: string };

export function Entrada({ tipo = "text", valor, ...p }: Base & { tipo?: "text" | "date" | "email" | "tel"; valor?: string | null; mayusculas?: boolean; placeholder?: string }) {
  const errores = useContext(Errores);
  return (
    <Campo etiqueta={p.etiqueta} error={errores[p.nombre]} ayuda={p.ayuda} className={p.className}>
      {(a11y) => (
        <input
          {...a11y}
          name={p.nombre}
          type={tipo}
          defaultValue={valor ?? ""}
          placeholder={p.placeholder}
          className={cn(claseControl, p.mayusculas && "uppercase")}
        />
      )}
    </Campo>
  );
}

export function Numero({ valor, ...p }: Base & { valor?: string | number | null; entero?: boolean }) {
  const errores = useContext(Errores);
  return (
    <Campo etiqueta={p.etiqueta} error={errores[p.nombre]} ayuda={p.ayuda} className={p.className}>
      {(a11y) => (
        <input {...a11y} name={p.nombre} inputMode={p.entero ? "numeric" : "decimal"} autoComplete="off" defaultValue={valor ?? ""} className={cn(claseControl, "tabular-nums")} />
      )}
    </Campo>
  );
}

export type Opcion = { valor: string; etiqueta: string };

export function Seleccion({ opciones, valor, vacio = "Selecciona…", ...p }: Base & { opciones: Opcion[]; valor?: string | null; vacio?: string | false }) {
  const errores = useContext(Errores);
  return (
    <Campo etiqueta={p.etiqueta} error={errores[p.nombre]} ayuda={p.ayuda} className={p.className}>
      {(a11y) => (
        <select {...a11y} name={p.nombre} defaultValue={valor ?? ""} className={claseControl}>
          {vacio !== false && <option value="">{vacio}</option>}
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

export function AreaTexto({ valor, ...p }: Base & { valor?: string | null }) {
  const errores = useContext(Errores);
  return (
    <Campo etiqueta={p.etiqueta} error={errores[p.nombre]} ayuda={p.ayuda} className={p.className}>
      {(a11y) => <textarea {...a11y} name={p.nombre} rows={3} defaultValue={valor ?? ""} className={cn(claseControl, "h-auto py-2")} />}
    </Campo>
  );
}

export function Casilla({ nombre, etiqueta, valor, valorCasilla = "on" }: { nombre: string; etiqueta: ReactNode; valor?: boolean; valorCasilla?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-tinta">
      <input type="checkbox" name={nombre} value={valorCasilla} defaultChecked={valor} className="size-4 accent-marca-600" />
      {etiqueta}
    </label>
  );
}

export function ArchivoEntrada({ nombre, etiqueta, ayuda, soloImagen }: { nombre: string; etiqueta: string; ayuda?: string; soloImagen?: boolean }) {
  const errores = useContext(Errores);
  return (
    <Campo etiqueta={etiqueta} error={errores[nombre]} ayuda={ayuda}>
      {(a11y) => (
        <input
          {...a11y}
          name={nombre}
          type="file"
          accept={soloImagen ? "image/jpeg,image/png,image/webp" : ".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"}
          className={cn(claseControl, "py-2 file:mr-3 file:rounded-md file:border-0 file:bg-superficie-2 file:px-3 file:py-1 file:text-sm")}
        />
      )}
    </Campo>
  );
}
