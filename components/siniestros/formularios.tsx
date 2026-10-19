import { agregarAfectado, anularSiniestro, avanzarEtapa, cerrarSiniestro, crearSiniestro, generarCuentaPorCobrar, guardarDatosSiniestro, guardarLimite, reabrirSiniestro, registrarActuacion, registrarImporte, vincularCobertura } from "@/actions/siniestros";
import { AreaTexto, Casilla, Entrada, FormularioAccion, Numero, Seleccion, type Opcion } from "@/components/formularios/formulario-accion";

/** Formularios de siniestros (expediente, etapas, importes, cobro, cierre y límites del período). */

const PERDIDA = [{ valor: "parcial", etiqueta: "Parcial" }, { valor: "total", etiqueta: "Total" }];
const ETIQUETA_SUJETO = { vehiculo: "Vehículo afectado", persona: "Persona afectada", propiedad: "Propiedad afectada" } as const;

export function FormularioSiniestro({ empresa, tipo, sujetos, transportistas, vehiculos, hoy }: {
  empresa: string;
  tipo: { id: number; sujeto: "vehiculo" | "persona" | "propiedad" | "transporte" };
  sujetos: Opcion[];
  transportistas: Opcion[];
  vehiculos: Opcion[];
  hoy: string;
}) {
  return (
    <FormularioAccion accion={crearSiniestro} boton="Abrir expediente" ocultos={{ empresa, id_tipo: String(tipo.id) }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Entrada nombre="fecha_evento" etiqueta="Fecha del evento" tipo="date" valor={hoy} />
        <Entrada nombre="fecha_notificacion" etiqueta="Fecha de notificación" tipo="date" valor={hoy} ayuda="Cuándo se avisó a la aseguradora." />
        <Entrada nombre="moneda" etiqueta="Moneda" valor="USD" mayusculas />
        <Entrada nombre="lugar" etiqueta="Lugar" className="sm:col-span-2" />
        <Entrada nombre="numero_aseguradora" etiqueta="N.º de la aseguradora" ayuda="Si ya lo asignó." />
      </div>
      {tipo.sujeto === "transporte" ? (
        <div className="grid gap-4 rounded-lg border border-dashed border-borde-fuerte p-4 sm:grid-cols-3">
          <Seleccion nombre="id_transportista" etiqueta="Transportista" opciones={transportistas} className="sm:col-span-2" ayuda={transportistas.length ? undefined : "Registra el transportista en Personas (empresa con la función «Transportista»)."} />
          <Entrada nombre="guia" etiqueta="Guía de despacho" />
          <Seleccion nombre="id_vehiculo" etiqueta="Vehículo propio (si lo era)" opciones={vehiculos} vacio="Del transportista" />
          <Entrada nombre="placa_texto" etiqueta="Placa del transportista" mayusculas />
          <div />
          <AreaTexto nombre="mercancia" etiqueta="Mercancía" className="sm:col-span-3" />
          <Numero nombre="valor_mercancia" etiqueta="Valor de la mercancía" />
          <Numero nombre="perdida" etiqueta="Pérdida estimada" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Seleccion nombre="id_sujeto" etiqueta={ETIQUETA_SUJETO[tipo.sujeto]} opciones={sujetos} className="sm:col-span-2" />
          <Seleccion nombre="tipo_perdida" etiqueta="Pérdida" opciones={PERDIDA} vacio="Por determinar" />
          <AreaTexto nombre="danos" etiqueta="Daños o lesiones" className="sm:col-span-3" />
        </div>
      )}
      <AreaTexto nombre="descripcion" etiqueta="Qué ocurrió" />
    </FormularioAccion>
  );
}

export function FormularioDatosSiniestro({ s }: { s: { id: number; numero_aseguradora: string | null; lugar: string | null; descripcion: string; tipo_perdida: string | null; fecha_notificacion: string } }) {
  return (
    <FormularioAccion accion={guardarDatosSiniestro} boton="Guardar cambios" variante="secundario" ocultos={{ id: String(s.id) }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Entrada nombre="numero_aseguradora" etiqueta="N.º de la aseguradora" valor={s.numero_aseguradora} />
        <Entrada nombre="fecha_notificacion" etiqueta="Fecha de notificación" tipo="date" valor={s.fecha_notificacion} />
        <Seleccion nombre="tipo_perdida" etiqueta="Pérdida" opciones={PERDIDA} valor={s.tipo_perdida} vacio="Por determinar" />
        <Entrada nombre="lugar" etiqueta="Lugar" valor={s.lugar} className="sm:col-span-3" />
      </div>
      <AreaTexto nombre="descripcion" etiqueta="Qué ocurrió" valor={s.descripcion} />
    </FormularioAccion>
  );
}

export function FormularioAfectado({ idSiniestro, sujeto, sujetos }: { idSiniestro: number; sujeto: "vehiculo" | "persona" | "propiedad"; sujetos: Opcion[] }) {
  return (
    <FormularioAccion accion={agregarAfectado} boton="Agregar afectado" variante="secundario" ocultos={{ id_siniestro: String(idSiniestro), cobertura: "" }}>
      <Seleccion nombre="id_sujeto" etiqueta={ETIQUETA_SUJETO[sujeto]} opciones={sujetos} />
      <AreaTexto nombre="danos" etiqueta="Daños o lesiones" />
    </FormularioAccion>
  );
}

export function FormularioCobertura({ idSiniestro, idAfectado, opciones }: { idSiniestro: number; idAfectado: number; opciones: Opcion[] }) {
  return (
    <FormularioAccion accion={vincularCobertura} boton="Vincular póliza" variante="secundario" ocultos={{ id_siniestro: String(idSiniestro), id_afectado: String(idAfectado) }}>
      <Seleccion nombre="cobertura" etiqueta="Póliza y cobertura que responde" opciones={opciones} />
    </FormularioAccion>
  );
}

export function FormularioEtapa({ idSiniestro, hoy, faltan }: { idSiniestro: number; hoy: string; faltan: string[] }) {
  return (
    <FormularioAccion accion={avanzarEtapa} boton="Terminar etapa y pasar a la siguiente" ocultos={{ id_siniestro: String(idSiniestro) }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Entrada nombre="fecha" etiqueta="Fecha" tipo="date" valor={hoy} />
        <Entrada nombre="observaciones" etiqueta="Observaciones" className="sm:col-span-2" />
      </div>
      {faltan.length > 0 && <Casilla nombre="sin_documentos" etiqueta={`Continuar sin esos documentos (${faltan.join(", ")})`} />}
    </FormularioAccion>
  );
}

export function FormularioActuacion({ idSiniestro, hoy }: { idSiniestro: number; hoy: string }) {
  return (
    <FormularioAccion accion={registrarActuacion} boton="Registrar actuación" variante="secundario" ocultos={{ id_siniestro: String(idSiniestro) }}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Entrada nombre="fecha" etiqueta="Fecha" tipo="date" valor={hoy} />
        <AreaTexto nombre="descripcion" etiqueta="Qué se hizo (llamada, visita, correo…)" className="sm:col-span-3" />
      </div>
    </FormularioAccion>
  );
}

export function FormularioImporte({ idSiniestro, hoy, moneda }: { idSiniestro: number; hoy: string; moneda: string }) {
  return (
    <FormularioAccion accion={registrarImporte} boton="Registrar importe" variante="secundario" ocultos={{ id_siniestro: String(idSiniestro) }}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Seleccion
          nombre="tipo"
          etiqueta="Tipo"
          vacio={false}
          valor="presupuestado"
          opciones={[{ valor: "presupuestado", etiqueta: "Presupuestado" }, { valor: "autorizado", etiqueta: "Autorizado por la aseguradora" }, { valor: "reconocido", etiqueta: "Reconocido (a reembolsar)" }]}
        />
        <Numero nombre="monto" etiqueta={`Monto (${moneda})`} />
        <Entrada nombre="fecha" etiqueta="Fecha" tipo="date" valor={hoy} />
        <Entrada nombre="referencia" etiqueta="Referencia" />
      </div>
      <Entrada nombre="motivo" etiqueta="Motivo del cambio" ayuda="Si reemplaza un importe anterior, por qué." />
    </FormularioAccion>
  );
}

export function FormularioCobro({ idSiniestro, contrapartes, contraparte, monto, hoy, moneda }: { idSiniestro: number; contrapartes: Opcion[]; contraparte: string | null; monto: string; hoy: string; moneda: string }) {
  return (
    <FormularioAccion accion={generarCuentaPorCobrar} boton="Crear cuenta por cobrar" variante="secundario" ocultos={{ id_siniestro: String(idSiniestro) }}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Seleccion nombre="id_contraparte" etiqueta="Quién debe pagar" opciones={contrapartes} valor={contraparte} className="sm:col-span-2" />
        <Numero nombre="monto" etiqueta={`Monto (${moneda})`} valor={monto.replace(".", ",")} />
        <Entrada nombre="fecha_vencimiento" etiqueta="Vence" tipo="date" valor={hoy} />
      </div>
      <Entrada nombre="documento" etiqueta="Finiquito o recibo de la aseguradora" />
    </FormularioAccion>
  );
}

export function FormularioCierre({ idSiniestro, hoy }: { idSiniestro: number; hoy: string }) {
  return (
    <FormularioAccion accion={cerrarSiniestro} boton="Cerrar expediente" variante="secundario" ocultos={{ id_siniestro: String(idSiniestro) }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Entrada nombre="fecha" etiqueta="Fecha de cierre" tipo="date" valor={hoy} />
        <Entrada nombre="motivo" etiqueta="Motivo" placeholder="Reparación entregada y reembolso reconocido" className="sm:col-span-2" />
      </div>
    </FormularioAccion>
  );
}

export function FormularioMotivo({ idSiniestro, accion }: { idSiniestro: number; accion: "reabrir" | "anular" }) {
  return (
    <FormularioAccion accion={accion === "reabrir" ? reabrirSiniestro : anularSiniestro} boton={accion === "reabrir" ? "Reabrir" : "Anular expediente"} variante="secundario" ocultos={{ id_siniestro: String(idSiniestro) }}>
      <Entrada nombre="motivo" etiqueta="Motivo" />
    </FormularioAccion>
  );
}

export function FormularioLimite({ idPeriodo, coberturas, moneda }: { idPeriodo: number; coberturas: Opcion[]; moneda: string }) {
  return (
    <FormularioAccion accion={guardarLimite} boton="Agregar límite" variante="secundario" ocultos={{ id_periodo: String(idPeriodo) }}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Seleccion nombre="tipo" etiqueta="Tipo" vacio={false} opciones={[{ valor: "agregado_anual", etiqueta: "Agregado anual" }, { valor: "por_bien", etiqueta: "Por bien (vehículo, propiedad, persona)" }]} />
        <Numero nombre="monto" etiqueta={`Monto (${moneda})`} />
        <Seleccion nombre="id_cobertura" etiqueta="Cobertura" opciones={coberturas} vacio="Todas" />
        <Seleccion nombre="consume" etiqueta="Consume" vacio={false} valor="reconocido" opciones={[{ valor: "reconocido", etiqueta: "Monto reconocido" }, { valor: "autorizado", etiqueta: "Monto autorizado" }]} />
      </div>
      <Entrada nombre="descripcion" etiqueta="Descripción" placeholder="Riesgos diversos — límite anual" />
    </FormularioAccion>
  );
}
