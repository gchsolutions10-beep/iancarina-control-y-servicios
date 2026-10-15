import { guardarParte } from "@/actions/personas";
import { AreaTexto, Casilla, Entrada, FormularioAccion, Seleccion, type Opcion } from "@/components/formularios/formulario-accion";

type Valores = {
  id?: number;
  tipo: "natural" | "juridica";
  tipo_identificacion?: string;
  numero_identificacion?: string;
  nombres?: string | null;
  apellidos?: string | null;
  razon_social?: string | null;
  funciones?: string[];
  fecha_nacimiento?: string | null;
  telefono?: string | null;
  correo?: string | null;
  direccion?: string | null;
  observaciones?: string | null;
};

/** Alta o edición de una ficha. Los datos personales solo se muestran con su permiso. */
export function FormularioParte({ valores, tiposId, funciones, empresas, verSensibles }: { valores: Valores; tiposId: Opcion[]; funciones: Opcion[]; empresas?: Opcion[]; verSensibles: boolean }) {
  const natural = valores.tipo === "natural";
  const ocultos: Record<string, string> = { tipo: valores.tipo, ...(valores.id ? { id: String(valores.id) } : {}) };
  if (!valores.id && empresas?.length === 1) ocultos.empresa = empresas[0].valor;
  return (
    <FormularioAccion accion={guardarParte} boton={valores.id ? "Guardar cambios" : "Crear ficha"} ocultos={ocultos}>
      {!valores.id && empresas && empresas.length > 1 && <Seleccion nombre="empresa" etiqueta="Empresa" opciones={empresas} />}
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Seleccion nombre="tipo_identificacion" etiqueta="Tipo" opciones={tiposId} valor={valores.tipo_identificacion ?? (natural ? "V" : "J")} vacio={false} />
        <Entrada nombre="numero_identificacion" etiqueta={natural ? "Cédula / pasaporte" : "RIF"} valor={valores.numero_identificacion} />
      </div>
      {natural ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada nombre="nombres" etiqueta="Nombres" valor={valores.nombres} mayusculas />
          <Entrada nombre="apellidos" etiqueta="Apellidos" valor={valores.apellidos} mayusculas />
        </div>
      ) : (
        <>
          <Entrada nombre="razon_social" etiqueta="Razón social" valor={valores.razon_social} mayusculas />
          <fieldset>
            <legend className="text-sm font-medium text-tinta">Funciones</legend>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {funciones.map((f) => (
                <Casilla key={f.valor} nombre="funciones" etiqueta={f.etiqueta} valorCasilla={f.valor} valor={valores.funciones?.includes(f.valor)} />
              ))}
            </div>
          </fieldset>
        </>
      )}
      {verSensibles ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {natural && <Entrada nombre="fecha_nacimiento" etiqueta="Fecha de nacimiento" tipo="date" valor={valores.fecha_nacimiento} ayuda="Solo si la póliza la exige." />}
          <Entrada nombre="telefono" etiqueta="Teléfono" tipo="tel" valor={valores.telefono} />
          <Entrada nombre="correo" etiqueta="Correo" tipo="email" valor={valores.correo} />
          <AreaTexto nombre="direccion" etiqueta="Dirección" valor={valores.direccion} className="sm:col-span-3" />
        </div>
      ) : (
        <p className="text-sm text-tinta-suave">Los datos personales (contacto, dirección, nacimiento) solo los ven usuarios con ese permiso.</p>
      )}
      <AreaTexto nombre="observaciones" etiqueta="Observaciones" valor={valores.observaciones} />
      {!valores.id && <Casilla nombre="es_distinta" etiqueta="Es una persona distinta (marcar solo si el sistema avisa de un nombre parecido)" />}
    </FormularioAccion>
  );
}
