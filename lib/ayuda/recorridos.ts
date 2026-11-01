/**
 * Recorridos guiados: un paso a paso por pantalla que resalta cada parte y explica qué hacer.
 * Se abren solos la primera vez que el usuario entra a la pantalla, se pueden saltar y se repiten
 * desde el botón «i» o desde el Manual. Lógica pura (probada en tests/recorridos.test.ts).
 *
 * Cada paso apunta a un elemento marcado con `data-recorrido` (ver `ancla`); si el usuario no lo ve
 * (por ejemplo, un botón que su rol no tiene), el paso se omite. Sin ancla, el paso va centrado.
 */

export type PasoRecorrido = { ancla?: string; titulo: string; texto: string };
export type Recorrido = {
  id: string;
  ruta: RegExp;
  titulo: string;
  pasos: PasoRecorrido[];
  /** Solo vale si este elemento está en la pantalla (p. ej. el paso previo de elegir la empresa). */
  requiere?: string;
};

/** Nombre de ancla de una sección a partir de su título («Tarifas del período» → seccion-tarifas-del-periodo). */
export function slugRecorrido(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

const a = (nombre: string) => `[data-recorrido="${nombre}"]`;
/** Sección por el comienzo de su título (los títulos con datos variables, como «Etapas · flujo», también calzan). */
const s = (titulo: string) => `[data-recorrido^="seccion-${slugRecorrido(titulo)}"]`;

// Pasos que se repiten en varias pantallas.
const ayuda: PasoRecorrido = { ancla: a("ayuda"), titulo: "Guía de esta pantalla", texto: "El botón «i» abre la guía completa: quién la usa, cómo llenarla y qué evitar. Desde ahí también puede repetir este recorrido." };
const filtros = (que: string): PasoRecorrido => ({ ancla: a("filtros"), titulo: "Buscar y filtrar", texto: `Escriba y pulse Enter para buscar ${que}. Las listas se aplican solas al cambiarlas.` });
const tabla = (texto: string): PasoRecorrido => ({ ancla: a("tabla"), titulo: "La lista", texto });
const tarjetas = (texto: string): PasoRecorrido => ({ ancla: a("tarjetas"), titulo: "Tarjetas de control", texto });
const historial: PasoRecorrido = { ancla: s("Historial"), titulo: "Historial", texto: "Quién cambió qué y cuándo. Sale de la bitácora y nadie lo puede modificar." };
const documentos: PasoRecorrido = { ancla: s("Documentos y fotografías"), titulo: "Documentos y fotos", texto: "Suba cédulas, pólizas, recibos o fotos. Quedan guardados de forma privada y se ven desde aquí." };

/** Campo de un formulario por su nombre (se resalta con su etiqueta; si está plegado, se despliega). */
const c = (nombre: string, seccion?: string) => (seccion ? `${s(seccion)} [name="${nombre}"]` : `main [name="${nombre}"]`);
const guardar = (texto: string): PasoRecorrido => ({ ancla: "main form button[type=submit]", titulo: "Guardar", texto });

export const RECORRIDOS: Recorrido[] = [
  // Pasos previos de algunos formularios (van primero: ganan cuando su elemento está en la pantalla).
  {
    id: "elegir-empresa",
    ruta: /^\/(polizas\/nueva|siniestros\/nuevo)$/,
    requiere: a("elegir-empresa"),
    titulo: "Elegir la empresa",
    pasos: [
      { ancla: a("elegir-empresa"), titulo: "¿De qué empresa es?", texto: "Usted trabaja con varias empresas: primero elija a cuál pertenece este registro. Al elegirla se abre el formulario y le explico cada campo." },
    ],
  },
  {
    id: "siniestro-tipo",
    ruta: /^\/siniestros\/nuevo$/,
    requiere: a("elegir-tipo"),
    titulo: "Tipo de siniestro",
    pasos: [
      { ancla: a("elegir-tipo"), titulo: "¿Qué pasó?", texto: "Elija el tipo: choque, robo, accidente de una persona, daño a una propiedad o pérdida de mercancía con un transportista. Cada tipo tiene sus etapas y documentos. Al elegirlo se abre el formulario." },
    ],
  },
  {
    id: "bienvenida",
    ruta: /^\/inicio$/,
    titulo: "Bienvenida",
    pasos: [
      { titulo: "Bienvenido al Control de Seguros", texto: "Aquí se lleva todo lo de los seguros de la empresa: quién y qué está asegurado, cuánto cuesta, qué se debe pagar y qué pasó con cada siniestro. Este recorrido le muestra dónde está cada cosa; puede saltarlo y repetirlo desde el Manual." },
      { ancla: a("primeros-pasos"), titulo: "Primeros pasos", texto: "Esta lista le dice qué hacer y en qué orden. Cada tarea se marca sola cuando ya está hecha. Pulse «Hacer ahora» y el sistema lo lleva a la pantalla con su propio recorrido." },
      { ancla: a("menu"), titulo: "El menú", texto: "Arriba están las áreas del sistema. Cada persona ve solo las que su usuario tiene asignadas." },
      { ancla: a("menu-gestion-de-polizas"), titulo: "Gestión de Pólizas", texto: "Aquí está todo el trabajo diario: personas y empresas, vehículos y propiedades, pólizas, siniestros, pagos y reportes." },
      { ancla: a("menu-configuracion"), titulo: "Configuración", texto: "Usuarios, empresas, listas, reglas de cálculo, flujos de siniestros y ajustes. Normalmente solo la usa el administrador." },
      { ancla: a("avisos"), titulo: "Avisos", texto: "La campana cuenta lo que necesita atención: pólizas por vencer, primas vencidas, cobros pendientes y siniestros detenidos. Pulse un aviso para ir directo a él." },
      { ancla: a("menu-manual"), titulo: "Manual", texto: "La guía de cada pantalla, en un solo lugar. Desde ahí también se repiten estos recorridos." },
      { titulo: "El botón «i»", texto: "En cada pantalla, junto al título, hay un botón redondo «i» que explica cómo usarla. Si se pierde, búsquelo." },
      { ancla: a("modulos"), titulo: "Sus módulos", texto: "Cada tarjeta abre un módulo. La primera vez que entre a cada uno, un recorrido como este le explicará sus partes." },
    ],
  },
  {
    id: "gestion-polizas",
    ruta: /^\/gestion-polizas$/,
    titulo: "Gestión de Pólizas",
    pasos: [
      { ancla: a("modulos"), titulo: "Todo en un solo lugar", texto: "Cada sección agrupa sus módulos: personas, activos, pólizas, siniestros, finanzas e indicadores." },
      { titulo: "El orden de trabajo", texto: "1) Registre a la aseguradora y a las personas.  2) Registre los vehículos y propiedades.  3) Cree la póliza y cargue lo asegurado.  4) Confírmela y registre los pagos.  5) Si algo ocurre, abra un siniestro.  6) Consulte el tablero y los reportes." },
    ],
  },
  // ------------------------------------------------------------------ personas
  {
    id: "personas",
    ruta: /^\/personas\/fichas$/,
    titulo: "Fichas de personas",
    pasos: [
      { ancla: a("titulo"), titulo: "Personas y empresas", texto: "Una sola ficha por persona u organización. Aquí están los asegurados, beneficiarios y propietarios, y también las aseguradoras, corredores, talleres y transportistas." },
      { ancla: a("acciones"), titulo: "Nueva ficha", texto: "Para registrar a alguien nuevo. Antes, búsquelo: si ya existe, use esa ficha." },
      filtros("por nombre o cédula/RIF"),
      tabla("Pulse un nombre para abrir su ficha: datos, documentos, pólizas, siniestros e historial."),
      ayuda,
    ],
  },
  {
    id: "persona-ficha",
    ruta: /^\/personas\/\d+$/,
    titulo: "Ficha de persona",
    pasos: [
      { ancla: s("Datos"), titulo: "Datos", texto: "Identificación y contacto. Puede corregirlos y pulsar «Guardar». Los datos personales solo los ve quien tiene ese permiso." },
      { ancla: a("acciones"), titulo: "Estado y fusión", texto: "Si esta persona quedó registrada dos veces, «Fusionar con otra ficha» deja una sola sin perder nada." },
      { ancla: s("Vehículos y propiedades"), titulo: "Sus bienes", texto: "Vehículos y propiedades donde figura como propietario o responsable." },
      documentos,
      { ancla: s("Pólizas"), titulo: "Pólizas", texto: "Dónde está asegurada, es beneficiaria o tomadora." },
      { ancla: s("Siniestros"), titulo: "Siniestros", texto: "Expedientes donde figura como afectada." },
      historial,
    ],
  },
  {
    id: "persona-nueva",
    ruta: /^\/personas\/nueva$/,
    titulo: "Nueva ficha",
    pasos: [
      { ancla: a("tipo-ficha"), titulo: "¿Persona o empresa?", texto: "Elija «Persona natural» para una persona, o «Empresa / organización» para una aseguradora, corredor, taller o transportista." },
      { ancla: c("empresa"), titulo: "Empresa", texto: "A cuál de sus empresas pertenece esta ficha. Cada empresa tiene sus propias fichas." },
      { ancla: c("tipo_identificacion"), titulo: "Tipo de documento", texto: "V o E para cédula, P para pasaporte, J o G para RIF." },
      { ancla: c("numero_identificacion"), titulo: "Número", texto: "Con o sin puntos y guiones: el sistema los quita. No deja repetir el mismo número en la empresa." },
      { ancla: c("nombres"), titulo: "Nombres y apellidos", texto: "Tal como aparecen en la cédula. Se guardan en mayúsculas." },
      { ancla: c("razon_social"), titulo: "Razón social", texto: "El nombre legal de la empresa, como aparece en el RIF." },
      { ancla: c("funciones"), titulo: "Funciones", texto: "Marque «Aseguradora» si es una compañía de seguros: solo así aparecerá al crear pólizas. Igual con corredor, taller o transportista." },
      { ancla: c("telefono"), titulo: "Contacto", texto: "Teléfono, correo y dirección son opcionales; ayudan a ubicarla." },
      { ancla: c("es_distinta"), titulo: "Nombres parecidos", texto: "Si al guardar el sistema avisa que hay alguien con un nombre parecido y usted sabe que es otra persona, marque esta casilla y guarde de nuevo." },
      guardar("Al guardar se abre la ficha, donde podrá subir la cédula u otros documentos."),
    ],
  },
  {
    id: "duplicados",
    ruta: /^\/personas\/duplicados$/,
    titulo: "Personas duplicadas",
    pasos: [
      { titulo: "¿Para qué sirve?", texto: "A veces la misma persona se registra dos veces (por ejemplo, con V y con E). Aquí se juntan en una sola ficha sin perder pólizas, pagos ni siniestros." },
      { ancla: s("Posibles duplicados"), titulo: "Posibles duplicados", texto: "El sistema propone pares con el mismo número de identificación o un nombre muy parecido. «Comparar» los pone lado a lado; «No son la misma» los quita de esta lista." },
      { ancla: s("Fusiones registradas"), titulo: "Fusiones registradas", texto: "Cada fusión queda aquí con su motivo. Si fue un error, «Revertir» devuelve todo a la ficha original." },
      ayuda,
    ],
  },
  {
    id: "fusionar",
    ruta: /^\/personas\/fusionar$/,
    titulo: "Fusionar fichas",
    pasos: [
      { ancla: s("Comparación"), titulo: "Comparación", texto: "A la izquierda la ficha duplicada (desaparece de las listas), a la derecha la que queda. Revise que sean la misma persona: identificación, nombre y fecha de nacimiento." },
      { ancla: a("acciones"), titulo: "Intercambiar", texto: "Si debe quedar la otra ficha, pulse «Intercambiar»." },
      { ancla: s("Qué va a pasar"), titulo: "Qué va a pasar", texto: "Cuántos registros pasan a la ficha que queda y qué datos se completan. Nada se borra." },
      { ancla: c("motivo"), titulo: "Motivo", texto: "Escriba por qué las une, por ejemplo: «misma persona registrada con E por error»." },
      { ancla: c("confirmo"), titulo: "Confirmar", texto: "Marque la casilla y pulse «Fusionar fichas»." },
    ],
  },
  // ------------------------------------------------------------------ activos
  {
    id: "vehiculos",
    ruta: /^\/activos\/vehiculos$/,
    titulo: "Vehículos",
    pasos: [
      { ancla: a("titulo"), titulo: "La flota", texto: "Vehículos propios y de terceros, con su propietario, fotos y documentos. Las toneladas (TM) dicen la capacidad de cada camión (por ejemplo, 18 o 30)." },
      { ancla: a("acciones"), titulo: "Nuevo vehículo", texto: "Para registrar un vehículo. Después podrá asegurarlo en una póliza." },
      filtros("por placa"),
      tabla("Pulse una placa para abrir su ficha: datos, fotos, propietario, pólizas y siniestros."),
      ayuda,
    ],
  },
  {
    id: "vehiculo-nuevo",
    ruta: /^\/activos\/vehiculos\/nuevo$/,
    titulo: "Nuevo vehículo",
    pasos: [
      { ancla: c("empresa"), titulo: "Empresa", texto: "A cuál empresa pertenece el vehículo." },
      { ancla: c("placa"), titulo: "Placa", texto: "Con o sin guiones: el sistema la normaliza y no deja repetirla." },
      { ancla: c("origen"), titulo: "Origen", texto: "Propio si es de la empresa; de tercero si es alquilado o de otra persona." },
      { ancla: c("tipo_vehiculo"), titulo: "Tipo", texto: "Camión, chuto, automóvil, moto… El tipo define la clase para la tarifa de la póliza." },
      { ancla: c("id_modelo"), titulo: "Marca y modelo", texto: "Elíjalo de la lista. Si falta, el administrador lo agrega en Configuración → Catálogos." },
      { ancla: c("tm"), titulo: "Toneladas (TM)", texto: "Capacidad de carga en toneladas métricas, por ejemplo 18 o 30. Solo para camiones y chutos." },
      guardar("Al guardar se abre la ficha del vehículo, donde se suben fotos y documentos y se registra el propietario."),
    ],
  },
  {
    id: "vehiculo-ficha",
    ruta: /^\/activos\/vehiculos\/\d+$/,
    titulo: "Ficha del vehículo",
    pasos: [
      { ancla: s("Datos del vehículo"), titulo: "Datos", texto: "Placa, marca, modelo, tipo y toneladas. Corrija y pulse «Guardar» si hace falta." },
      { ancla: s("Propietario y responsable"), titulo: "Propietario y responsable", texto: "Quién es el dueño legal y quién responde por el vehículo. Al registrar uno nuevo, el anterior queda en el historial." },
      documentos,
      { ancla: s("Pólizas"), titulo: "Pólizas", texto: "En qué pólizas está asegurado y hasta cuándo." },
      { ancla: s("Siniestros"), titulo: "Siniestros", texto: "Choques, robos u otros siniestros de este vehículo." },
      { ancla: s("Venta o baja"), titulo: "Venta o baja", texto: "Si se vende o se retira, regístrelo aquí: no se borra, queda en el historial y ya no se renueva en las pólizas." },
      historial,
    ],
  },
  {
    id: "propiedades",
    ruta: /^\/activos\/propiedades$/,
    titulo: "Propiedades",
    pasos: [
      { ancla: a("titulo"), titulo: "Propiedades", texto: "Casas, edificios, galpones e instalaciones que se aseguran, con su valor, fotos y documentos." },
      { ancla: a("acciones"), titulo: "Nueva propiedad", texto: "Para registrar una propiedad." },
      tabla("Pulse una propiedad para abrir su ficha."),
      ayuda,
    ],
  },
  {
    id: "propiedad-nueva",
    ruta: /^\/activos\/propiedades\/nueva$/,
    titulo: "Nueva propiedad",
    pasos: [
      { ancla: c("nombre"), titulo: "Nombre", texto: "Cómo la conocen en la empresa, por ejemplo «Galpón Maracay»." },
      { ancla: c("tipo_inmueble"), titulo: "Tipo", texto: "Casa, edificio, galpón, local…" },
      { ancla: c("valor_declarado"), titulo: "Valor declarado", texto: "El valor con que se asegura, con su moneda." },
      { ancla: c("direccion"), titulo: "Dirección", texto: "Dónde está la propiedad, con una referencia para ubicarla." },
      guardar("Al guardar se abre la ficha para subir fotos y documentos."),
    ],
  },
  {
    id: "propiedad-ficha",
    ruta: /^\/activos\/propiedades\/\d+$/,
    titulo: "Ficha de la propiedad",
    pasos: [
      { ancla: s("Propietario y responsable"), titulo: "Titulares", texto: "Propietario y responsable, con su historial." },
      documentos,
      { ancla: s("Pólizas"), titulo: "Pólizas", texto: "En qué pólizas está asegurada." },
      historial,
    ],
  },
  // ------------------------------------------------------------------ pólizas
  {
    id: "polizas",
    ruta: /^\/polizas\/lista$/,
    titulo: "Pólizas",
    pasos: [
      { titulo: "Cómo funciona una póliza", texto: "Cada póliza tiene vigencias (normalmente un año). En cada vigencia se cargan los asegurados y las tarifas, el sistema calcula la prima y, al confirmarla, queda la prima por pagar a la aseguradora." },
      tarjetas("Cuántas pólizas están vigentes, por vencer, vencidas o en preparación. Pulse una tarjeta para ver solo esas."),
      { ancla: a("acciones"), titulo: "Nueva póliza", texto: "Para registrar una póliza nueva. Necesita tener creada la aseguradora en Personas." },
      filtros("por número o aseguradora"),
      tabla("Pulse un número de póliza para ver sus vigencias y trabajar en ellas."),
      ayuda,
    ],
  },
  {
    id: "poliza-nueva",
    ruta: /^\/polizas\/nueva$/,
    titulo: "Nueva póliza",
    pasos: [
      { ancla: c("id_aseguradora"), titulo: "Aseguradora", texto: "La compañía de seguros. Si no aparece, créela en Personas → Nueva ficha → Empresa, marcando la función «Aseguradora»." },
      { ancla: c("numero"), titulo: "Número de póliza", texto: "El número que aparece en el cuadro de póliza de la aseguradora." },
      { ancla: c("id_ramo"), titulo: "Ramo", texto: "Qué asegura: automóvil (flota), accidentes personales, incendio… El ramo trae sus coberturas." },
      { ancla: c("moneda"), titulo: "Moneda", texto: "La moneda de la póliza. Todo lo de esta póliza (primas, pagos) va en esa moneda; el sistema no convierte." },
      { ancla: c("vigencia_desde"), titulo: "Vigencia", texto: "Desde y hasta, como dice la póliza (normalmente un año)." },
      { ancla: c("id_tomador"), titulo: "Tomador", texto: "Quién contrata la póliza, normalmente su empresa." },
      guardar("Al crearla, se abre su primera vigencia «en preparación» para cargar asegurados y tarifas."),
    ],
  },
  {
    id: "poliza",
    ruta: /^\/polizas\/\d+$/,
    titulo: "Póliza",
    pasos: [
      { ancla: s("Vigencias"), titulo: "Vigencias", texto: "Cada año es una vigencia con sus asegurados, primas y endosos. Pulse una para trabajar en ella." },
      { ancla: s("Datos de la póliza"), titulo: "Datos", texto: "Aseguradora, ramo y descripción." },
      documentos,
      historial,
    ],
  },
  {
    id: "periodo",
    ruta: /^\/polizas\/periodos\/\d+$/,
    titulo: "Vigencia de la póliza",
    pasos: [
      { titulo: "Esta es la pantalla principal de una póliza", texto: "Aquí se carga todo lo de un año: quién paga, las tarifas, lo asegurado, el cálculo de la prima, la confirmación, los endosos y lo que se debe pagar. Vamos parte por parte." },
      { ancla: a("indicadores"), titulo: "Resumen", texto: "Cuántos asegurados hay, la suma asegurada, la prima total y el saldo por pagar. Se actualiza solo." },
      { ancla: s("Tomador, contratante, pagador y corredor"), titulo: "Quién contrata y quién paga", texto: "Tomador, contratante, pagador y corredor. Ser tomador no hace a nadie asegurado." },
      { ancla: s("Tarifas del período"), titulo: "Tarifas", texto: "El precio de cada cobertura según el contrato: una tasa en % (casco) o una prima fija por vehículo (RCV, APOV…)." },
      { ancla: c("id_cobertura", "Tarifas del período"), titulo: "Agregar una tarifa", texto: "Elija la cobertura, la clase de vehículo si aplica, y escriba la tasa anual o la prima fija que le dio la aseguradora. Luego «Guardar tarifa»." },
      { ancla: s("Asegurados y coberturas"), titulo: "Asegurados", texto: "Cada vehículo, persona o propiedad cubierta, con sus coberturas y su prima. Pulse un asegurado para ver el detalle." },
      { ancla: c("id_sujeto", "Asegurados y coberturas"), titulo: "Agregar un asegurado", texto: "Elija el vehículo, la persona o la propiedad." },
      { ancla: c("ceco", "Asegurados y coberturas"), titulo: "CECO y certificado", texto: "El centro de costo al que se carga la prima y el número de certificado de la aseguradora." },
      { ancla: c("suma_asegurada", "Asegurados y coberturas"), titulo: "Suma asegurada", texto: "Cuánto vale lo asegurado (para vehículos, el valor del bien más aditamentos). Con esto se calcula la prima por tasa." },
      { ancla: a("calcular"), titulo: "Calcular primas", texto: "Calcula la prima de todos los asegurados con las tarifas y las reglas. Si falta un dato, el sistema le dice cuál." },
      { ancla: s("Confirmar período"), titulo: "Confirmar", texto: "Cuando todo esté cargado, confirme: se genera la prima por pagar a la aseguradora. Después ya no se edita: los cambios se hacen por endoso." },
      { ancla: s("Endosos"), titulo: "Endosos", texto: "Altas y bajas durante el año. El sistema calcula la prima por los días que faltan: cobra las altas y devuelve las bajas." },
      { ancla: s("Primas por pagar y devoluciones"), titulo: "Lo que se debe", texto: "La prima por pagar y las devoluciones por bajas. Pulse una para registrar el pago." },
      ayuda,
    ],
  },
  {
    id: "renovaciones",
    ruta: /^\/polizas\/renovaciones$/,
    titulo: "Renovación anual",
    pasos: [
      { titulo: "Renovar sin volver a cargar todo", texto: "Al terminar el año, el sistema copia la póliza al año siguiente con los mismos asegurados y tarifas (sin lo vendido o retirado). Usted solo revisa y ajusta." },
      { ancla: s("Por renovar"), titulo: "Por renovar", texto: "Vigencias que terminan pronto o ya terminaron. Pulse «Preparar renovación» en la que corresponda." },
      { ancla: s("En preparación"), titulo: "En preparación", texto: "Renovaciones listas para revisar: ábralas, compare contra el año anterior, ajuste tarifas y confirme." },
      ayuda,
    ],
  },
  // ------------------------------------------------------------------ siniestros
  {
    id: "siniestros",
    ruta: /^\/siniestros\/lista$/,
    titulo: "Siniestros",
    pasos: [
      { titulo: "¿Qué es un expediente?", texto: "Cada choque, robo, accidente o pérdida es un expediente con su número (SIN-2026-0001), sus etapas, documentos, montos y el reembolso que paga la aseguradora." },
      tarjetas("Abiertos, sin movimiento (detenidos, conviene revisarlos), cerrados por cobrar y cerrados. Pulse una tarjeta para filtrar."),
      { ancla: a("acciones"), titulo: "Nuevo expediente", texto: "Para registrar un siniestro. Primero elija el tipo; el sistema le asigna su número y sus etapas." },
      filtros("por expediente, placa o descripción"),
      tabla("Pulse un expediente para seguirlo: etapas, montos, documentos y cobro."),
      ayuda,
    ],
  },
  {
    id: "siniestro-nuevo",
    ruta: /^\/siniestros\/nuevo$/,
    titulo: "Nuevo expediente",
    pasos: [
      { ancla: a("titulo"), titulo: "El tipo elegido", texto: "Debajo del título ve la empresa y el tipo de siniestro que eligió. Si no es el correcto, vuelva atrás y elija otro." },
      { ancla: c("id_sujeto"), titulo: "Afectado", texto: "El vehículo, la persona o la propiedad afectada." },
      { ancla: c("fecha_evento"), titulo: "Fechas", texto: "Cuándo ocurrió y cuándo se avisó a la aseguradora." },
      { ancla: c("lugar"), titulo: "Lugar", texto: "Dónde ocurrió: ciudad, vía o instalación." },
      { ancla: c("descripcion"), titulo: "Qué ocurrió", texto: "Cuéntelo en pocas palabras. Se puede completar después." },
      guardar("Al abrir el expediente, el sistema lo numera y lo pone en su primera etapa. La póliza que responde se vincula después, dentro del expediente."),
    ],
  },
  {
    id: "siniestro",
    ruta: /^\/siniestros\/\d+$/,
    titulo: "Expediente de siniestro",
    pasos: [
      { ancla: s("Etapas"), titulo: "Etapas", texto: "El camino del expediente (aviso, inspección, reparación, reembolso…). Cuando una etapa termine, pulse «Terminar etapa y pasar a la siguiente». Le avisa si falta un documento." },
      { ancla: s("Afectados y póliza"), titulo: "Afectados y póliza", texto: "Quién o qué resultó afectado. «Vincular póliza» indica qué póliza y cobertura responde; el sistema le muestra las que estaban vigentes ese día." },
      { ancla: s("Límites de la póliza"), titulo: "Límites", texto: "Cuánto queda disponible de la póliza. Avisa al llegar al 80 % y bloquea al pasarse." },
      { ancla: s("Importes"), titulo: "Montos", texto: "Presupuestado, autorizado por la aseguradora y reconocido. Si cambia un monto, registre el nuevo: el anterior queda como historial." },
      { ancla: s("Cuenta por cobrar del reembolso"), titulo: "Reembolso", texto: "Lo reconocido se cobra a la aseguradora en Finanzas. Cerrar el expediente no significa que ya se cobró." },
      { ancla: s("Actuaciones"), titulo: "Actuaciones", texto: "Anote cada llamada, visita o correo. Así el expediente no aparece como detenido." },
      documentos,
      { ancla: s("Datos del siniestro"), titulo: "Datos", texto: "Fechas, lugar, descripción y número que le dio la aseguradora." },
      ayuda,
    ],
  },
  // ------------------------------------------------------------------ finanzas
  {
    id: "primas",
    ruta: /^\/finanzas\/primas$/,
    titulo: "Primas y cobros",
    pasos: [
      { titulo: "¿Qué hay aquí?", texto: "«Primas por pagar»: lo que se debe a las aseguradoras por cada póliza o endoso. «Cuentas por cobrar»: lo que las aseguradoras deben a la empresa (reembolsos de siniestros y devoluciones por bajas)." },
      tarjetas("Saldos vencidos, por vencer, pendientes y pagados, por moneda. Pulse una tarjeta para ver solo esos."),
      filtros("por aseguradora o póliza"),
      tabla("Pulse una fila para registrar un pago o un cobro (puede ser parcial)."),
      ayuda,
    ],
  },
  {
    id: "obligacion",
    ruta: /^\/finanzas\/primas\/\d+$/,
    titulo: "Pago de una prima",
    pasos: [
      { ancla: s("Origen"), titulo: "De dónde viene", texto: "De qué póliza, endoso o siniestro es este saldo." },
      { ancla: c("fecha"), titulo: "Registrar un pago", texto: "Escriba la fecha del pago." },
      { ancla: c("monto"), titulo: "Monto", texto: "Viene con el saldo completo; cámbielo si es un pago parcial." },
      { ancla: c("referencia"), titulo: "Referencia y registrar", texto: "Escriba el número de transferencia o recibo y pulse «Registrar pago». El saldo baja solo. Si se equivocó, el pago se anula con un motivo; nunca se borra." },
    ],
  },
  // ------------------------------------------------------------------ reportes
  {
    id: "tablero",
    ruta: /^\/reportes\/tablero$/,
    titulo: "Tablero gerencial",
    pasos: [
      { ancla: a("indicadores"), titulo: "Los números clave", texto: "Pólizas vigentes, primas, sumas aseguradas, lo que se debe, lo que se debe cobrar y los siniestros. Cada importe va por moneda: nunca se suman monedas distintas." },
      { ancla: s("Prima neta por ramo"), titulo: "Prima por ramo", texto: "Cuánto cuesta cada tipo de seguro. Pase el cursor por una barra para ver el monto; debajo está la tabla." },
      { ancla: s("Siniestros por mes"), titulo: "Siniestros por mes", texto: "Cuántos siniestros hubo cada mes en el último año." },
      { ancla: s("Pólizas por vencer"), titulo: "Lo que vence", texto: "Pólizas y primas próximas a vencer, con enlace a cada una." },
      ayuda,
    ],
  },
  {
    id: "reportes",
    ruta: /^\/reportes\/lista$/,
    titulo: "Reportes",
    pasos: [
      { ancla: a("tabla-reportes"), titulo: "Elija un reporte", texto: "Pólizas y vigencias, asegurados, primas por centro de costo (CECO), saldos con antigüedad y siniestros. Todos se descargan en Excel o PDF." },
      ayuda,
    ],
  },
  {
    id: "reporte",
    ruta: /^\/reportes\/(?!lista$|tablero$)[a-z-]+$/,
    titulo: "Reporte",
    pasos: [
      filtros("y combinar filtros (empresa, fechas, estado…)"),
      { ancla: a("exportar"), titulo: "Excel o PDF", texto: "«Excel» descarga todas las filas; «Imprimir o PDF» abre la impresión (elija «Guardar como PDF»)." },
      tabla("Los totales van al pie, por moneda. Copie la dirección del navegador para compartir este reporte con los mismos filtros."),
    ],
  },
  // ------------------------------------------------------------------ configuración
  {
    id: "configuracion",
    ruta: /^\/configuracion$/,
    titulo: "Configuración",
    pasos: [
      { ancla: a("opciones-configuracion"), titulo: "Configuración", texto: "Aquí se prepara el sistema: usuarios y sus permisos, empresas, listas (marcas, ramos, coberturas), reglas de cálculo, flujos de siniestros y ajustes. Cada cambio queda registrado." },
      { titulo: "Orden recomendado", texto: "1) Empresas.  2) Usuarios con su rol en cada empresa.  3) Catálogos (ramos y coberturas).  4) Reglas: aprobarlas con el contrato.  5) Ajustes de plazos." },
    ],
  },
  {
    id: "usuarios",
    ruta: /^\/admin\/usuarios$/,
    titulo: "Usuarios",
    pasos: [
      { ancla: a("acciones"), titulo: "Nuevo usuario", texto: "Cree el usuario con una clave temporal; al entrar por primera vez deberá cambiarla." },
      tabla("Pulse un usuario para darle su rol en cada empresa: Analista (ve y registra) o Consulta (solo ve), permisos especiales, o bloquearlo. Los usuarios no se borran."),
      ayuda,
    ],
  },
  {
    id: "usuario",
    ruta: /^\/admin\/usuarios\/(\d+|nuevo)$/,
    titulo: "Usuario",
    pasos: [
      { ancla: s("Datos del usuario"), titulo: "Datos", texto: "Nombre, usuario de entrada y cargo." },
      { titulo: "Rol por empresa", texto: "En cada empresa elija Analista (ve y registra) o Consulta (solo ve), con fecha «hasta» si es temporal. Sin rol, no ve esa empresa." },
      { ancla: s("Notificaciones"), titulo: "Avisos", texto: "Con «Recibe alertas», la campana se abre sola cuando hay algo vencido." },
      { ancla: s("Estado"), titulo: "Bloquear", texto: "Para quitar el acceso, bloquee al usuario: no se borra, así se conserva lo que registró." },
    ],
  },
  {
    id: "empresas",
    ruta: /^\/admin\/empresas$/,
    titulo: "Empresas",
    pasos: [
      { ancla: s("Nueva empresa"), titulo: "Nueva empresa", texto: "Código corto (por ejemplo «mary-iancarina»), nombre y RIF. Cada empresa se maneja por separado y cada usuario ve solo las suyas." },
      tabla("Las empresas no se borran: se desactivan y conservan su historial."),
    ],
  },
  {
    id: "catalogos",
    ruta: /^\/admin\/catalogos$/,
    titulo: "Catálogos",
    pasos: [
      { titulo: "Listas del sistema", texto: "Los valores que aparecen en los formularios: tipos de documento, colores, tipos de vehículo… Pulse un valor para activarlo o desactivarlo; nada se borra." },
      { ancla: s("Marcas y modelos de vehículos"), titulo: "Marcas y modelos", texto: "Si al registrar un vehículo falta su marca o modelo, agréguelo aquí." },
      { ancla: s("Ramos y coberturas"), titulo: "Ramos y coberturas", texto: "Los tipos de seguro y sus coberturas (RCV, casco, APOV…), que luego llevan tarifa en cada póliza." },
      ayuda,
    ],
  },
  {
    id: "reglas",
    ruta: /^\/admin\/reglas$/,
    titulo: "Reglas de cálculo",
    pasos: [
      { titulo: "¿Qué es una regla?", texto: "La fórmula con que el sistema calcula una prima, por ejemplo «suma asegurada × tasa ÷ 100». Los números (tasas y primas) no van aquí: van en las tarifas de cada póliza." },
      { ancla: s("Cómo se escriben las fórmulas"), titulo: "Fórmulas", texto: "Las variables y funciones que se pueden usar." },
      { ancla: s("Reglas"), titulo: "Propuesta y aprobada", texto: "«Propuesta» es la práctica habitual del mercado, aún sin confirmar con el contrato. Cuando coincida con lo que dice la aseguradora, pulse «Aprobar». Si se equivoca, «Volver a propuesta»." },
      { titulo: "Cambiar una regla", texto: "Una regla no se edita: «Nueva versión» crea otra desde una fecha y lo ya calculado conserva la versión anterior. Si la creó por error y no se usó, «Deshacer versión»." },
      ayuda,
    ],
  },
  {
    id: "flujos",
    ruta: /^\/admin\/flujos$/,
    titulo: "Flujos de siniestros",
    pasos: [
      { ancla: s("Tipos de siniestro"), titulo: "Tipos y flujos", texto: "Cada tipo de siniestro (choque, robo, accidente…) usa un flujo: la lista de etapas por las que pasa el expediente, con sus documentos requeridos." },
      { ancla: s("Nuevo flujo"), titulo: "Nuevo flujo", texto: "Cree un flujo con sus etapas en orden. Los expedientes abiertos conservan el flujo con que empezaron." },
      ayuda,
    ],
  },
  {
    id: "ajustes",
    ruta: /^\/ajustes$/,
    titulo: "Ajustes",
    pasos: [{ titulo: "Parámetros", texto: "Cuántos días antes se avisa que una póliza o una prima vence, cuántos días sin movimiento marcan un siniestro como detenido, el aviso de límites y el tamaño máximo de archivos. El cambio vale de inmediato." }],
  },
  {
    id: "programador",
    ruta: /^\/admin\/base-datos$/,
    titulo: "Programador",
    pasos: [
      { ancla: s("Registros por empresa"), titulo: "Qué hay en la base", texto: "Cuántos registros tiene cada empresa por grupo." },
      { ancla: s("Datos de ejemplo"), titulo: "Datos de ejemplo", texto: "Solo en la demo: carga personas, vehículos con fotos, pólizas, pagos y siniestros marcados (DEMO) para presentar el sistema." },
      { ancla: s("Limpiar datos"), titulo: "Limpiar", texto: "Deja el sistema en blanco por grupos y empresa, en una sola operación y con motivo. No toca usuarios, empresas ni configuración." },
    ],
  },
  {
    id: "manual",
    ruta: /^\/manual$/,
    titulo: "Manual",
    pasos: [
      { ancla: a("indice-manual"), titulo: "Índice", texto: "Las guías de las pantallas que usted puede usar. Pulse una para ir a ella." },
      { ancla: a("recorridos-manual"), titulo: "Repetir recorridos", texto: "Desde aquí puede ver de nuevo la bienvenida, volver a mostrar todos los recorridos o los primeros pasos." },
    ],
  },
];

/** Recorridos posibles de una ruta, en orden (los que tienen `requiere` se eligen si su elemento está). */
export function recorridosDe(ruta: string): Recorrido[] {
  return RECORRIDOS.filter((r) => r.ruta.test(ruta));
}

/** Recorrido principal de una ruta (null si la pantalla no tiene). */
export function recorridoDe(ruta: string): Recorrido | null {
  return RECORRIDOS.find((r) => !r.requiere && r.ruta.test(ruta)) ?? null;
}
