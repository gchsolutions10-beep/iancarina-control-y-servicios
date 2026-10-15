import { crearPoliza } from "@/actions/polizas";
import { AreaTexto, Entrada, FormularioAccion, Seleccion, type Opcion } from "@/components/formularios/formulario-accion";

/** Póliza nueva con su primera vigencia (queda «En preparación» hasta confirmarla). */
export function FormularioPoliza({ empresa, aseguradoras, ramos, partes, hoy }: { empresa: string; aseguradoras: Opcion[]; ramos: Opcion[]; partes: Opcion[]; hoy: string }) {
  return (
    <FormularioAccion accion={crearPoliza} boton="Crear póliza" ocultos={{ empresa }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Seleccion nombre="id_aseguradora" etiqueta="Aseguradora" opciones={aseguradoras} className="sm:col-span-2" />
        <Entrada nombre="numero" etiqueta="Número de póliza" mayusculas />
        <Seleccion nombre="id_ramo" etiqueta="Ramo" opciones={ramos} className="sm:col-span-2" />
        <Entrada nombre="moneda" etiqueta="Moneda" valor="USD" mayusculas ayuda="3 letras. No se convierte." />
        <Entrada nombre="vigencia_desde" etiqueta="Vigencia desde" tipo="date" valor={hoy} />
        <Entrada nombre="vigencia_hasta" etiqueta="Vigencia hasta" tipo="date" ayuda="Vacío = un año después (fecha de fin de la póliza)." />
        <Seleccion nombre="id_tomador" etiqueta="Tomador" opciones={partes} />
      </div>
      <AreaTexto nombre="descripcion" etiqueta="Descripción" />
    </FormularioAccion>
  );
}
