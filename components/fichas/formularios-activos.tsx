import { darDeBaja, guardarPropiedad, guardarVehiculo } from "@/actions/activos";
import { AreaTexto, Casilla, Entrada, FormularioAccion, Numero, Seleccion, type Opcion } from "@/components/formularios/formulario-accion";

const ocultosAlta = (id: number | undefined, empresas?: Opcion[]): Record<string, string> =>
  id ? { id: String(id) } : empresas?.length === 1 ? { empresa: empresas[0].valor } : {};

type Vehiculo = {
  id?: number; origen?: string; placa?: string; id_modelo?: number | null; anio?: number | null; tm?: string | null; color?: string | null;
  tipo_vehiculo?: string | null; clasificacion_chuto?: string | null; tiene_batea?: boolean; fecha_adquisicion?: string | null; observaciones?: string | null;
};

export function FormularioVehiculo({ v, empresas, modelos, colores, tipos, chutos }: { v: Vehiculo; empresas?: Opcion[]; modelos: Opcion[]; colores: Opcion[]; tipos: Opcion[]; chutos: Opcion[] }) {
  return (
    <FormularioAccion accion={guardarVehiculo} boton={v.id ? "Guardar cambios" : "Crear vehículo"} ocultos={ocultosAlta(v.id, empresas)}>
      {!v.id && empresas && empresas.length > 1 && <Seleccion nombre="empresa" etiqueta="Empresa" opciones={empresas} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Entrada nombre="placa" etiqueta="Placa" valor={v.placa} mayusculas />
        <Seleccion nombre="origen" etiqueta="Origen" valor={v.origen ?? "propio"} vacio={false} opciones={[{ valor: "propio", etiqueta: "Propio" }, { valor: "tercero", etiqueta: "De terceros" }]} />
        <Seleccion nombre="tipo_vehiculo" etiqueta="Tipo" valor={v.tipo_vehiculo} opciones={tipos} />
        <Seleccion nombre="id_modelo" etiqueta="Marca y modelo" valor={v.id_modelo ? String(v.id_modelo) : ""} opciones={modelos} className="sm:col-span-2" ayuda={modelos.length === 0 ? "Carga marcas y modelos en Configuración." : undefined} />
        <Numero nombre="anio" etiqueta="Año" valor={v.anio} entero />
        <Seleccion nombre="color" etiqueta="Color" valor={v.color} opciones={colores} />
        <Numero nombre="tm" etiqueta="TM (toneladas métricas)" valor={v.tm?.replace(".", ",")} ayuda="Capacidad de carga: 18, 30…" />
        <Seleccion nombre="clasificacion_chuto" etiqueta="Clasificación de chuto" valor={v.clasificacion_chuto} opciones={chutos} vacio="No aplica" />
        <Entrada nombre="fecha_adquisicion" etiqueta="Fecha de adquisición" tipo="date" valor={v.fecha_adquisicion} />
      </div>
      <Casilla nombre="tiene_batea" etiqueta="Tiene batea" valor={v.tiene_batea} />
      <AreaTexto nombre="observaciones" etiqueta="Observaciones" valor={v.observaciones} />
    </FormularioAccion>
  );
}

type Propiedad = { id?: number; nombre?: string; tipo_inmueble?: string | null; direccion?: string | null; valor_declarado?: string | null; moneda?: string | null; observaciones?: string | null };

export function FormularioPropiedad({ p, empresas, tipos }: { p: Propiedad; empresas?: Opcion[]; tipos: Opcion[] }) {
  return (
    <FormularioAccion accion={guardarPropiedad} boton={p.id ? "Guardar cambios" : "Crear propiedad"} ocultos={ocultosAlta(p.id, empresas)}>
      {!p.id && empresas && empresas.length > 1 && <Seleccion nombre="empresa" etiqueta="Empresa" opciones={empresas} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Entrada nombre="nombre" etiqueta="Nombre" valor={p.nombre} className="sm:col-span-2" />
        <Seleccion nombre="tipo_inmueble" etiqueta="Tipo de inmueble" valor={p.tipo_inmueble} opciones={tipos} />
        <Numero nombre="valor_declarado" etiqueta="Valor declarado" valor={p.valor_declarado} ayuda="Opcional." />
        <Entrada nombre="moneda" etiqueta="Moneda" valor={p.moneda} placeholder="USD" mayusculas />
      </div>
      <AreaTexto nombre="direccion" etiqueta="Dirección" valor={p.direccion} />
      <AreaTexto nombre="observaciones" etiqueta="Observaciones" valor={p.observaciones} />
    </FormularioAccion>
  );
}

/** Venta, transferencia o retiro (el activo se conserva en el historial). */
export function FormularioBaja({ tipo, id }: { tipo: "vehiculo" | "propiedad"; id: number }) {
  return (
    <FormularioAccion accion={darDeBaja} boton="Registrar baja" variante="secundario" ocultos={{ tipo, id: String(id) }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Seleccion nombre="motivo_baja" etiqueta="Motivo" opciones={[{ valor: "venta", etiqueta: "Venta" }, { valor: "transferencia", etiqueta: "Transferencia" }, { valor: "retiro", etiqueta: "Retiro / desincorporación" }]} />
        <Entrada nombre="fecha_baja" etiqueta="Fecha efectiva" tipo="date" />
      </div>
      <AreaTexto nombre="observaciones" etiqueta="Observaciones" />
    </FormularioAccion>
  );
}
