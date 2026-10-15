"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Lock, Save, Wand2 } from "lucide-react";
import { guardarUsuario, type EstadoUsuario } from "@/actions/usuarios";
import { AvisoBloqueo, CampoTexto, Seccion } from "@/components/formularios/controles";
import { claseBoton } from "@/components/ui/boton";
import { Campo, claseControl, MensajeEstado } from "@/components/ui/campo";
import { enviarSinReiniciar } from "@/components/ui/enviar-sin-reiniciar";
import { cn } from "@/lib/cn";
import { generarClaveTemporal } from "@/lib/usuarios/clave-temporal";

export type AsignacionFormulario = { rol: string; hasta: string; excepciones: string[]; hastaExcepciones: string };

export type ValoresUsuario = {
  nombre_usuario: string;
  nombre_apellido: string;
  cedula: string;
  cargo: string;
  bloqueado: boolean;
  recibe_alertas: boolean;
  recibe_aprobaciones: boolean;
  globales: string[];
  empresas: Record<string, AsignacionFormulario>;
};

/** Lo que el gestor puede hacer en cada empresa (calculado en el servidor con lib/usuarios/alcance.ts). */
export type OpcionesEmpresa = {
  codigo: string;
  nombre: string;
  editable: boolean;
  roles: { codigo: string; nombre: string }[];
  excepciones: { codigo: string; nombre: string; detalle: string }[];
};

type Props = {
  id: number | null;
  iniciales: ValoresUsuario;
  empresas: OpcionesEmpresa[];
  /** Roles globales que puede asignar (solo el administrador). */
  rolesGlobales: { codigo: string; nombre: string; detalle: string }[];
  esUnoMismo: boolean;
  puedeBloquear: boolean;
};

function Casilla({ nombre, valor, marcado, alCambiar, titulo, detalle, deshabilitado }: {
  nombre: string;
  valor: string;
  marcado: boolean;
  alCambiar: (marcado: boolean) => void;
  titulo: string;
  detalle?: string;
  deshabilitado?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-150 ease-suave",
        marcado ? "border-marca-600/40 bg-marca-600/5" : "border-borde hover:bg-superficie-2",
        deshabilitado && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="checkbox"
        name={nombre}
        value={valor}
        checked={marcado}
        disabled={deshabilitado}
        onChange={(e) => alCambiar(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-marca-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-tinta">{titulo}</span>
        {detalle && <span className="block text-xs text-tinta-tenue">{detalle}</span>}
      </span>
    </label>
  );
}

const SIN_ASIGNACION: AsignacionFormulario = { rol: "", hasta: "", excepciones: [], hastaExcepciones: "" };

export function FormularioUsuario({ id, iniciales, empresas, rolesGlobales, esUnoMismo, puedeBloquear }: Props) {
  const [v, setV] = useState(iniciales);
  const [clave, setClave] = useState("");
  const [estado, accion, pendiente] = useActionState<EstadoUsuario, FormData>(guardarUsuario, null);
  const errores = estado?.errores ?? {};
  const cambiar = (nombre: string, valor: string) => setV((x) => ({ ...x, [nombre]: valor }));
  const asignacion = (d: string) => v.empresas[d] ?? SIN_ASIGNACION;
  const cambiarEmpresa = (d: string, cambio: Partial<AsignacionFormulario>) =>
    setV((x) => {
      const nueva = { ...(x.empresas[d] ?? SIN_ASIGNACION), ...cambio };
      // Sin rol en la empresa no puede tener permisos excepcionales allí.
      if (!nueva.rol) Object.assign(nueva, { hasta: "", excepciones: [], hastaExcepciones: "" });
      return { ...x, empresas: { ...x.empresas, [d]: nueva } };
    });

  return (
    <form onSubmit={enviarSinReiniciar(accion)} noValidate className="flex flex-col gap-4">
      {id && <input type="hidden" name="id" value={id} />}

      <Seccion titulo="Datos del usuario">
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto nombre="nombre_apellido" etiqueta="Nombre y apellido" valor={v.nombre_apellido} alCambiar={cambiar} error={errores.nombre_apellido} mayusculas />
          <CampoTexto
            nombre="nombre_usuario"
            etiqueta="Usuario (para iniciar sesión)"
            valor={v.nombre_usuario}
            alCambiar={(n, x) => cambiar(n, x.replace(/\s/g, ""))}
            error={errores.nombre_usuario}
          />
          <CampoTexto nombre="cedula" etiqueta="Cédula" valor={v.cedula} alCambiar={cambiar} error={errores.cedula} />
          <CampoTexto nombre="cargo" etiqueta="Cargo" valor={v.cargo} alCambiar={cambiar} error={errores.cargo} mayusculas />
        </div>
      </Seccion>

      <Seccion
        titulo="Empresas"
        descripcion="Un rol por empresa. Con fecha de vencimiento, el acceso termina solo al cerrar ese día (útil para cubrir vacaciones)."
      >
        {esUnoMismo && rolesGlobales.length === 0 && <AvisoBloqueo>No puedes cambiar tus propios permisos: pídeselo a tu gerente o al administrador.</AvisoBloqueo>}
        <div className="flex flex-col divide-y divide-borde">
          {empresas.map((d) => {
            const a = asignacion(d.codigo);
            const rolActual = d.roles.find((r) => r.codigo === a.rol)?.nombre ?? a.rol;
            if (!d.editable) {
              return (
                <div key={d.codigo} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium text-tinta">{d.nombre}</span>
                  <span className="inline-flex items-center gap-1.5 text-sm text-tinta-suave">
                    <Lock className="size-3.5" aria-hidden />
                    {a.rol ? `${rolActual}${a.hasta ? ` hasta ${a.hasta}` : ""}` : "Sin acceso"}
                    <span className="sr-only">(no lo gestionas tú)</span>
                  </span>
                </div>
              );
            }
            return (
              <fieldset key={d.codigo} className="grid gap-4 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_1fr]">
                <legend className="sr-only">{d.nombre}</legend>
                <Campo etiqueta={d.nombre} error={errores[`rol_${d.codigo}`]}>
                  {(a11y) => (
                    <select {...a11y} name={`rol_${d.codigo}`} value={a.rol} onChange={(e) => cambiarEmpresa(d.codigo, { rol: e.target.value })} className={claseControl}>
                      <option value="">Sin acceso</option>
                      {d.roles.map((r) => (
                        <option key={r.codigo} value={r.codigo}>
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                  )}
                </Campo>
                <CampoTexto
                  tipo="date"
                  nombre={`hasta_${d.codigo}`}
                  etiqueta="Vigente hasta (opcional)"
                  valor={a.hasta}
                  alCambiar={(_, x) => cambiarEmpresa(d.codigo, { hasta: x })}
                  ayuda={a.rol ? undefined : "Asigna un rol primero"}
                />
                {a.rol && d.excepciones.length > 0 && (
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-xs font-medium tracking-wide text-tinta-tenue uppercase">Permisos excepcionales</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {d.excepciones.map((e) => (
                        <Casilla
                          key={e.codigo}
                          nombre={`exc_${d.codigo}`}
                          valor={e.codigo}
                          marcado={a.excepciones.includes(e.codigo)}
                          alCambiar={(m) =>
                            cambiarEmpresa(d.codigo, { excepciones: m ? [...a.excepciones, e.codigo] : a.excepciones.filter((x) => x !== e.codigo) })
                          }
                          titulo={e.nombre}
                          detalle={e.detalle}
                        />
                      ))}
                    </div>
                    {a.excepciones.length > 0 && (
                      <CampoTexto
                        tipo="date"
                        nombre={`exc_hasta_${d.codigo}`}
                        etiqueta="Permisos excepcionales vigentes hasta (opcional)"
                        valor={a.hastaExcepciones}
                        alCambiar={(_, x) => cambiarEmpresa(d.codigo, { hastaExcepciones: x })}
                        className="mt-3 sm:max-w-xs"
                      />
                    )}
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>
      </Seccion>

      {rolesGlobales.length > 0 && (
        <Seccion titulo="Roles de todo el sistema" descripcion="Solo el administrador los asigna.">
          <div className="grid gap-2 sm:grid-cols-2">
            {rolesGlobales.map((r) => (
              <Casilla
                key={r.codigo}
                nombre="globales"
                valor={r.codigo}
                marcado={v.globales.includes(r.codigo)}
                alCambiar={(m) => setV((x) => ({ ...x, globales: m ? [...x.globales, r.codigo] : x.globales.filter((g) => g !== r.codigo) }))}
                titulo={r.nombre}
                detalle={r.detalle}
                deshabilitado={esUnoMismo && r.codigo === "administrador"}
              />
            ))}
          </div>
          {esUnoMismo && v.globales.includes("administrador") && <input type="hidden" name="globales" value="administrador" />}
        </Seccion>
      )}

      <Seccion titulo="Notificaciones" descripcion="Solo recibe las de las empresas y módulos a los que tiene acceso.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Casilla
            nombre="recibe_alertas"
            valor="on"
            marcado={v.recibe_alertas}
            alCambiar={(m) => setV((x) => ({ ...x, recibe_alertas: m }))}
            titulo="Recibe notificaciones de alertas"
            detalle="Recordatorios y vencimientos: marcas, permisos y demás sistemas."
          />
          <Casilla
            nombre="recibe_aprobaciones"
            valor="on"
            marcado={v.recibe_aprobaciones}
            alCambiar={(m) => setV((x) => ({ ...x, recibe_aprobaciones: m }))}
            titulo="Recibe notificaciones de aprobaciones"
            detalle="Solicitudes que esperan su aprobación: pago de facturas y compliance."
          />
        </div>
      </Seccion>

      {id ? (
        puedeBloquear && (
          <Seccion titulo="Estado">
            <Casilla
              nombre="bloqueado"
              valor="on"
              marcado={v.bloqueado}
              alCambiar={(m) => setV((x) => ({ ...x, bloqueado: m }))}
              titulo="Usuario bloqueado"
              detalle="No puede iniciar sesión y su sesión abierta se cierra. Sus registros se conservan."
            />
          </Seccion>
        )
      ) : (
        <Seccion titulo="Clave temporal" descripcion="Entrégasela al usuario: al entrar por primera vez deberá cambiarla por una propia.">
          <div className="flex flex-wrap items-end gap-3">
            <Campo etiqueta="Clave temporal" error={errores.clave} ayuda="Mínimo 8 caracteres, con letras y números" className="min-w-56 flex-1 sm:max-w-sm">
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
            <button type="button" onClick={() => setClave(generarClaveTemporal())} className={cn(claseBoton("secundario", "lg"), "mb-[1.375rem]")}>
              <Wand2 className="size-4" aria-hidden />
              Generar
            </button>
          </div>
        </Seccion>
      )}
      {/* El estado bloqueado viaja aunque no se muestre la casilla (gestor sin alcance para bloquear). */}
      {id && !puedeBloquear && v.bloqueado && <input type="hidden" name="bloqueado" value="on" />}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-borde bg-fondo/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-xl sm:border">
        <div aria-live="polite" className="mr-auto min-w-0">
          {estado?.error && <MensajeEstado tipo="error">{estado.error}</MensajeEstado>}
          {estado?.ok && <MensajeEstado tipo="exito">{estado.mensaje}</MensajeEstado>}
        </div>
        <button type="submit" disabled={pendiente} className={claseBoton("primario", "lg")}>
          {pendiente ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          {id ? "Guardar cambios" : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}
