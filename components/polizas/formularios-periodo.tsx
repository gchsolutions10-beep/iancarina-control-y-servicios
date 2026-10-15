import { agregarAsegurado, agregarBeneficiario, asignarParte, confirmarPeriodo, descartarPeriodo, fijarPrimaAseguradora, guardarTarifa } from "@/actions/polizas";
import { altaPorEndoso, bajaPorEndoso, cambioPartePorEndoso } from "@/actions/endosos";
import { registrarPago } from "@/actions/finanzas";
import { AreaTexto, Casilla, Entrada, FormularioAccion, Numero, Seleccion, type Opcion } from "@/components/formularios/formulario-accion";
import { ROLES_PERIODO } from "@/lib/polizas/datos";

/** Formularios de la pantalla del período (preparación, endosos y pagos). */

const roles = Object.entries(ROLES_PERIODO).map(([valor, etiqueta]) => ({ valor, etiqueta }));
const BOTONES_ENDOSO = [
  { nombre: "modo", valor: "simular", texto: "Simular", variante: "secundario" as const },
  { nombre: "modo", valor: "confirmar", texto: "Confirmar endoso" },
];

export function FormularioParte({ idPeriodo, partes, confirmado, hoy }: { idPeriodo: number; partes: Opcion[]; confirmado: boolean; hoy: string }) {
  return (
    <FormularioAccion accion={confirmado ? cambioPartePorEndoso : asignarParte} boton={confirmado ? "Registrar cambio por endoso" : "Guardar"} ocultos={{ id_periodo: String(idPeriodo) }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Seleccion nombre="rol" etiqueta="Rol" opciones={roles} valor="tomador" vacio={false} />
        <Seleccion nombre="id_parte" etiqueta="Persona o empresa" opciones={partes} className="sm:col-span-2" />
        {confirmado && (
          <>
            <Entrada nombre="fecha_efectiva" etiqueta="Fecha efectiva" tipo="date" valor={hoy} />
            <Entrada nombre="numero_aseguradora" etiqueta="N.º de endoso (aseguradora)" />
            <Entrada nombre="motivo" etiqueta="Motivo" />
          </>
        )}
      </div>
    </FormularioAccion>
  );
}

export function FormularioTarifa({ idPeriodo, coberturas, clases, moneda }: { idPeriodo: number; coberturas: Opcion[]; clases: Opcion[]; moneda: string }) {
  return (
    <FormularioAccion accion={guardarTarifa} boton="Guardar tarifa" variante="secundario" ocultos={{ id_periodo: String(idPeriodo) }}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Seleccion nombre="id_cobertura" etiqueta="Cobertura" opciones={coberturas} className="sm:col-span-2" />
        <Seleccion nombre="clase" etiqueta="Clase" opciones={clases} vacio="Todas las clases" ayuda="Para RCV: tarifa por tipo de vehículo." />
        <div />
        <Numero nombre="tasa" etiqueta="Tasa anual (%)" ayuda="2,5 % se escribe 2,5." />
        <Numero nombre="prima_fija" etiqueta={`Prima fija anual (${moneda})`} />
      </div>
    </FormularioAccion>
  );
}

type Sujetos = (Opcion & { clase: string | null })[];

/** Asegurado nuevo: en preparación se agrega; en un período confirmado es un endoso de alta. */
export function FormularioAsegurado({ idPeriodo, sujeto, sujetos, coberturas, clases, confirmado, desde, hoy, moneda }: {
  idPeriodo: number;
  sujeto: "vehiculo" | "persona" | "propiedad";
  sujetos: Sujetos;
  coberturas: Opcion[];
  clases: Opcion[];
  confirmado: boolean;
  desde: string;
  hoy: string;
  moneda: string;
}) {
  const etiquetaSujeto = sujeto === "vehiculo" ? "Vehículo" : sujeto === "propiedad" ? "Propiedad" : "Persona";
  return (
    <FormularioAccion accion={confirmado ? altaPorEndoso : agregarAsegurado} ocultos={{ id_periodo: String(idPeriodo) }} boton="Agregar asegurado" botones={confirmado ? BOTONES_ENDOSO : undefined}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Seleccion nombre="id_sujeto" etiqueta={etiquetaSujeto} opciones={sujetos} className="sm:col-span-2" />
        {confirmado ? (
          <Entrada nombre="fecha_efectiva" etiqueta="Fecha efectiva del alta" tipo="date" valor={hoy > desde ? hoy : desde} />
        ) : (
          <Entrada nombre="desde" etiqueta="Incluido desde" tipo="date" valor={desde} ayuda="Si entra después del inicio, se prorratea." />
        )}
        <Entrada nombre="certificado" etiqueta="Certificado" />
        <Entrada nombre="ceco" etiqueta="CECO" ayuda="Formato por confirmar." />
        {sujeto === "vehiculo" && <Seleccion nombre="clase_tarifa" etiqueta="Clase para la tarifa" opciones={clases} vacio="La del vehículo (tipo)" />}
        {sujeto !== "persona" && (
          <>
            <Numero nombre="valor_bien" etiqueta={`Valor del bien (${moneda})`} ayuda={sujeto === "propiedad" ? "Vacío = valor declarado de la propiedad." : undefined} />
            {sujeto === "vehiculo" && <Numero nombre="aditamentos" etiqueta={`Aditamentos / blindaje (${moneda})`} />}
          </>
        )}
        <Numero nombre="suma_asegurada" etiqueta={`Suma asegurada (${moneda})`} ayuda={sujeto === "vehiculo" ? "Se calcula: valor + aditamentos." : "Si el ramo no tiene regla de suma, se usa esta."} />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-tinta">Coberturas</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {coberturas.map((c) => (
            <Casilla key={c.valor} nombre="coberturas" valorCasilla={c.valor} etiqueta={c.etiqueta} valor />
          ))}
        </div>
      </fieldset>
      {confirmado && <CamposEndoso moneda={moneda} etiquetaImporte="Prima del endoso según la aseguradora" />}
      <AreaTexto nombre="observaciones" etiqueta="Observaciones" />
    </FormularioAccion>
  );
}

function CamposEndoso({ moneda, etiquetaImporte }: { moneda: string; etiquetaImporte: string }) {
  return (
    <div className="grid gap-4 rounded-lg border border-dashed border-borde-fuerte p-4 sm:grid-cols-2">
      <Entrada nombre="numero_aseguradora" etiqueta="N.º de endoso (aseguradora)" />
      <Entrada nombre="fecha_vencimiento" etiqueta="Vence el pago / cobro" tipo="date" ayuda="Vacío = la fecha efectiva." />
      <Numero nombre="importe_aseguradora" etiqueta={`${etiquetaImporte} (${moneda})`} ayuda="Solo si difiere del cálculo o el cálculo está incompleto." />
      <Entrada nombre="motivo" etiqueta="Motivo" ayuda="Obligatorio si usa el importe de la aseguradora." />
    </div>
  );
}

export function FormularioBajaAsegurado({ idPeriodo, idInclusion, hoy, moneda }: { idPeriodo: number; idInclusion: number; hoy: string; moneda: string }) {
  return (
    <FormularioAccion accion={bajaPorEndoso} ocultos={{ id_periodo: String(idPeriodo), id_inclusion: String(idInclusion) }} botones={BOTONES_ENDOSO}>
      <Entrada nombre="fecha_efectiva" etiqueta="Fecha efectiva de la baja" tipo="date" valor={hoy} ayuda="Desde ese día deja de estar cubierto; se devuelve la prima de los días restantes." />
      <CamposEndoso moneda={moneda} etiquetaImporte="Devolución según la aseguradora" />
    </FormularioAccion>
  );
}

export function FormularioPrimaAseguradora({ idPeriodo, idLinea }: { idPeriodo: number; idLinea: number }) {
  return (
    <FormularioAccion accion={fijarPrimaAseguradora} boton="Usar este importe" variante="secundario" ocultos={{ id_periodo: String(idPeriodo), id: String(idLinea) }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Numero nombre="prima" etiqueta="Prima según la aseguradora" />
        <Entrada nombre="motivo" etiqueta="Motivo" placeholder="Según cuadro de la aseguradora" />
      </div>
    </FormularioAccion>
  );
}

export function FormularioBeneficiario({ idPeriodo, idInclusion, partes, confirmado, hoy }: { idPeriodo: number; idInclusion: number; partes: Opcion[]; confirmado: boolean; hoy: string }) {
  return (
    <FormularioAccion accion={agregarBeneficiario} boton={confirmado ? "Agregar por endoso" : "Agregar beneficiario"} variante="secundario" ocultos={{ id_periodo: String(idPeriodo), id_inclusion: String(idInclusion) }}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Seleccion nombre="id_parte" etiqueta="Persona" opciones={partes} className="sm:col-span-2" />
        <Entrada nombre="parentesco" etiqueta="Parentesco" />
        <Numero nombre="porcentaje" etiqueta="Porcentaje (%)" />
        {confirmado && <Entrada nombre="fecha" etiqueta="Fecha efectiva" tipo="date" valor={hoy} />}
      </div>
    </FormularioAccion>
  );
}

export function FormularioConfirmar({ idPeriodo, vencimiento }: { idPeriodo: number; vencimiento: string }) {
  return (
    <FormularioAccion accion={confirmarPeriodo} boton="Confirmar período" ocultos={{ id_periodo: String(idPeriodo) }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Entrada nombre="fecha_vencimiento" etiqueta="Vencimiento del pago de la prima" tipo="date" valor={vencimiento} />
        <Entrada nombre="documento" etiqueta="Recibo o aviso de cobro" />
      </div>
    </FormularioAccion>
  );
}

export function FormularioDescartar({ idPeriodo }: { idPeriodo: number }) {
  return (
    <FormularioAccion accion={descartarPeriodo} boton="Descartar" variante="secundario" ocultos={{ id_periodo: String(idPeriodo) }}>
      <Entrada nombre="motivo" etiqueta="Motivo" />
    </FormularioAccion>
  );
}

export function FormularioPago({ idObligacion, hoy, saldo, moneda, cobro }: { idObligacion: number; hoy: string; saldo: string; moneda: string; cobro: boolean }) {
  return (
    <FormularioAccion accion={registrarPago} boton={cobro ? "Registrar cobro" : "Registrar pago"} ocultos={{ id_obligacion: String(idObligacion) }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Entrada nombre="fecha" etiqueta="Fecha" tipo="date" valor={hoy} />
        <Numero nombre="monto" etiqueta={`Monto (${moneda})`} valor={saldo.replace(".", ",")} ayuda="Puede ser parcial." />
        <Entrada nombre="referencia" etiqueta="Referencia" />
      </div>
      <AreaTexto nombre="observaciones" etiqueta="Observaciones" />
    </FormularioAccion>
  );
}
