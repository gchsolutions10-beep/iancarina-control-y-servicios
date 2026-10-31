/**
 * Recorridos guiados: un paso a paso por pantalla que resalta cada parte y explica qué hacer.
 * Se abren solos la primera vez que el usuario entra a la pantalla, se pueden saltar y se repiten
 * desde el botón «i» o desde el Manual. Lógica pura (probada en tests/recorridos.test.ts).
 *
 * Cada paso apunta a un elemento marcado con `data-recorrido` (ver `ancla`); si el usuario no lo ve
 * (por ejemplo, un botón que su rol no tiene), el paso se omite. Sin ancla, el paso va centrado.
 */

export type PasoRecorrido = { ancla?: string; titulo: string; texto: string };
export type Recorrido = { id: string; ruta: RegExp; titulo: string; pasos: PasoRecorrido[] };

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

export const RECORRIDOS: Recorrido[] = [
  {
    id: "bienvenida",
    ruta: /^\/inicio$/,
    titulo: "Bienvenida",
    pasos: [
      { titulo: "Bienvenido al Control de Seguros", texto: "Este recorrido corto le muestra dónde está cada cosa. Puede saltarlo cuando quiera y repetirlo desde el Manual." },
      { ancla: a("menu"), titulo: "Menú", texto: "Arriba están las áreas del sistema. Solo ve las que su usuario tiene asignadas." },
      { ancla: a("menu-gestion-de-polizas"), titulo: "Gestión de Pólizas", texto: "Personas, vehículos, propiedades, pólizas, siniestros, finanzas y reportes: todo el trabajo diario está aquí." },
      { ancla: a("menu-configuracion"), titulo: "Configuración", texto: "Usuarios, empresas, catálogos, reglas de cálculo, flujos de siniestros y ajustes (según sus permisos)." },
      { ancla: a("avisos"), titulo: "Avisos", texto: "La campana avisa de pólizas por vencer, primas y cobros vencidos y expedientes detenidos. Pulse un aviso para ir directo." },
      { ancla: a("menu-manual"), titulo: "Manual", texto: "Reúne la guía de cada pantalla que usted puede usar. Cada pantalla tiene además su propio recorrido la primera vez que entra." },
      { ancla: a("modulos"), titulo: "Sus módulos", texto: "Estas tarjetas llevan a cada módulo. Empiece por donde le toque trabajar." },
    ],
  },
  {
    id: "gestion-polizas",
    ruta: /^\/gestion-polizas$/,
    titulo: "Gestión de Pólizas",
    pasos: [
      { ancla: a("modulos"), titulo: "Todo en un solo lugar", texto: "Cada sección agrupa sus módulos: personas, activos, pólizas, siniestros, finanzas e indicadores." },
      { titulo: "Orden recomendado", texto: "Primero las personas y organizaciones (aseguradoras), luego vehículos y propiedades, después las pólizas con sus asegurados y, cuando ocurra, los siniestros." },
    ],
  },
  // ------------------------------------------------------------------ personas
  {
    id: "personas",
    ruta: /^\/personas\/fichas$/,
    titulo: "Fichas de personas",
    pasos: [
      { ancla: a("titulo"), titulo: "Personas y empresas", texto: "Una sola ficha por persona u organización: asegurados, beneficiarios, propietarios, aseguradoras, talleres y transportistas." },
      { ancla: a("acciones"), titulo: "Nueva ficha", texto: "Antes de crear, busque: si ya existe, use esa ficha. El sistema avisa si hay nombres parecidos y no deja repetir la identificación." },
      filtros("por nombre o cédula/RIF"),
      tabla("Pulse un nombre para ver su ficha con pólizas, siniestros, documentos e historial."),
      ayuda,
    ],
  },
  {
    id: "persona-ficha",
    ruta: /^\/personas\/\d+$/,
    titulo: "Ficha de persona",
    pasos: [
      { ancla: s("Datos"), titulo: "Datos", texto: "Identificación y contacto. Los datos personales solo los ve quien tiene ese permiso." },
      { ancla: a("acciones"), titulo: "Estado y fusión", texto: "Si esta persona está registrada dos veces, «Fusionar con otra ficha» deja una sola sin perder nada." },
      documentos,
      { ancla: s("Pólizas"), titulo: "Pólizas y siniestros", texto: "Dónde está asegurada, beneficiaria o tomadora, y los siniestros donde figura." },
      historial,
    ],
  },
  {
    id: "persona-nueva",
    ruta: /^\/personas\/nueva$/,
    titulo: "Nueva ficha",
    pasos: [
      { titulo: "Crear una ficha", texto: "Elija persona natural o empresa, escriba la identificación y el nombre. Las organizaciones llevan sus funciones (aseguradora, taller…), que luego se usan en pólizas y siniestros." },
      { titulo: "Duplicados", texto: "Si ya hay fichas con un nombre parecido, el sistema las muestra. Si es otra persona, marque «Es una persona distinta» y guarde." },
    ],
  },
  {
    id: "duplicados",
    ruta: /^\/personas\/duplicados$/,
    titulo: "Personas duplicadas",
    pasos: [
      { ancla: s("Posibles duplicados"), titulo: "Posibles duplicados", texto: "Pares con el mismo número de identificación o un nombre muy parecido. «Comparar» los pone lado a lado; «No son la misma» los quita de la lista." },
      { ancla: s("Fusiones registradas"), titulo: "Fusiones registradas", texto: "Cada fusión queda aquí con su motivo. «Revertir» devuelve los registros a la ficha original." },
      ayuda,
    ],
  },
  {
    id: "fusionar",
    ruta: /^\/personas\/fusionar$/,
    titulo: "Fusionar fichas",
    pasos: [
      { ancla: s("Comparación"), titulo: "Comparación", texto: "A la izquierda la ficha duplicada, a la derecha la que queda. Revise identificación y datos." },
      { ancla: a("acciones"), titulo: "Intercambiar", texto: "Si debe quedar la otra ficha, pulse «Intercambiar»." },
      { ancla: s("Qué va a pasar"), titulo: "Qué va a pasar", texto: "Cuántos registros se mueven y qué datos se completan. Nada se borra." },
      { ancla: s("Confirmar"), titulo: "Confirmar", texto: "Escriba el motivo, marque la confirmación y pulse «Fusionar fichas»." },
    ],
  },
  // ------------------------------------------------------------------ activos
  {
    id: "vehiculos",
    ruta: /^\/activos\/vehiculos$/,
    titulo: "Vehículos",
    pasos: [
      { ancla: a("titulo"), titulo: "Flota", texto: "Vehículos propios y de terceros, con su propietario, fotos y documentos. Las toneladas (TM) indican la capacidad del camión." },
      { ancla: a("acciones"), titulo: "Nuevo vehículo", texto: "Registre la placa, marca, modelo y tipo. La placa no se repite." },
      filtros("por placa"),
      tabla("Pulse una placa para ver la ficha: titulares, pólizas donde está asegurado y siniestros."),
      ayuda,
    ],
  },
  {
    id: "vehiculo-ficha",
    ruta: /^\/activos\/vehiculos\/\d+$/,
    titulo: "Ficha del vehículo",
    pasos: [
      { ancla: s("Datos del vehículo"), titulo: "Datos", texto: "Placa, marca, modelo, tipo, toneladas y valor." },
      { ancla: s("Propietario y responsable"), titulo: "Titulares", texto: "Propietario legal y responsable. Al registrar uno nuevo, el anterior termina el día previo y queda en el historial." },
      documentos,
      { ancla: s("Venta o baja"), titulo: "Venta o baja", texto: "Los vehículos no se borran: se dan de baja y se conservan para el historial." },
      historial,
    ],
  },
  {
    id: "vehiculo-nuevo",
    ruta: /^\/activos\/vehiculos\/nuevo$/,
    titulo: "Nuevo vehículo",
    pasos: [{ titulo: "Registrar un vehículo", texto: "Placa, marca, modelo, tipo, año y, en camiones, las toneladas (TM). Después de guardar podrá subir fotos y documentos y registrar el propietario." }],
  },
  {
    id: "propiedades",
    ruta: /^\/activos\/propiedades$/,
    titulo: "Propiedades",
    pasos: [
      { ancla: a("titulo"), titulo: "Propiedades", texto: "Casas, edificios e instalaciones asegurables, con su valor declarado, fotos y documentos." },
      { ancla: a("acciones"), titulo: "Nueva propiedad", texto: "Registre el nombre, la dirección y el valor declarado." },
      tabla("Pulse una propiedad para ver su ficha, titulares y pólizas."),
      ayuda,
    ],
  },
  {
    id: "propiedad-nueva",
    ruta: /^\/activos\/propiedades\/nueva$/,
    titulo: "Nueva propiedad",
    pasos: [{ titulo: "Registrar una propiedad", texto: "Nombre, dirección y valor declarado. Después de guardar podrá subir fotos y documentos y registrar el propietario." }],
  },
  {
    id: "propiedad-ficha",
    ruta: /^\/activos\/propiedades\/\d+$/,
    titulo: "Ficha de la propiedad",
    pasos: [
      { ancla: s("Propietario y responsable"), titulo: "Titulares", texto: "Propietario y responsable, con su historial." },
      documentos,
      historial,
    ],
  },
  // ------------------------------------------------------------------ pólizas
  {
    id: "polizas",
    ruta: /^\/polizas\/lista$/,
    titulo: "Pólizas",
    pasos: [
      tarjetas("Pólizas vigentes, por vencer, vencidas y en preparación. Pulse una tarjeta para filtrar la lista."),
      { ancla: a("acciones"), titulo: "Nueva póliza", texto: "Cree la póliza con su aseguradora, número y ramo; después se cargan los asegurados de su primera vigencia." },
      filtros("por número o aseguradora"),
      tabla("Pulse un número de póliza para ver sus vigencias."),
      ayuda,
    ],
  },
  {
    id: "poliza-nueva",
    ruta: /^\/polizas\/nueva$/,
    titulo: "Nueva póliza",
    pasos: [
      { ancla: s("Datos de la póliza"), titulo: "Datos de la póliza", texto: "Aseguradora, número, ramo, fechas de la vigencia y moneda. Al crearla queda un período «en preparación» para cargar asegurados y tarifas." },
    ],
  },
  {
    id: "poliza",
    ruta: /^\/polizas\/\d+$/,
    titulo: "Póliza",
    pasos: [
      { ancla: s("Vigencias"), titulo: "Vigencias", texto: "Cada año es un período con sus asegurados, primas y endosos. Pulse uno para trabajar en él." },
      documentos,
      historial,
    ],
  },
  {
    id: "periodo",
    ruta: /^\/polizas\/periodos\/\d+$/,
    titulo: "Período de póliza",
    pasos: [
      { ancla: a("indicadores"), titulo: "Resumen", texto: "Asegurados, suma asegurada, prima y saldo por pagar de esta vigencia." },
      { ancla: s("Tomador, contratante, pagador y corredor"), titulo: "Partes", texto: "Quién contrata, quién paga y el corredor. Ser tomador no hace a nadie asegurado." },
      { ancla: s("Tarifas del período"), titulo: "Tarifas", texto: "Tasas y primas fijas del contrato. Las reglas de cálculo las usan para calcular cada prima." },
      { ancla: s("Asegurados y coberturas"), titulo: "Asegurados", texto: "Agregue vehículos, personas o propiedades con su suma asegurada y CECO. Pulse «Calcular primas» para ver las primas." },
      { ancla: s("Confirmar período"), titulo: "Confirmar", texto: "Revisa que no falte nada y genera la prima por pagar. Después ya no se edita: los cambios se hacen por endoso." },
      { ancla: s("Endosos"), titulo: "Endosos", texto: "Altas, bajas y cambios durante la vigencia, con prorrata por días y su ajuste de prima." },
      { ancla: s("Primas por pagar y devoluciones"), titulo: "Primas", texto: "Lo que se debe a la aseguradora y lo que devuelve por bajas. Los pagos se registran en Finanzas." },
      ayuda,
    ],
  },
  {
    id: "renovaciones",
    ruta: /^\/polizas\/renovaciones$/,
    titulo: "Renovación anual",
    pasos: [
      { ancla: s("Por renovar"), titulo: "Por renovar", texto: "Vigencias que terminan pronto o ya terminaron sin renovarse. «Preparar renovación» copia asegurados y tarifas al año siguiente." },
      { ancla: s("En preparación"), titulo: "En preparación", texto: "Renovaciones listas para revisar: compare contra el año anterior, ajuste tarifas y confirme." },
      ayuda,
    ],
  },
  // ------------------------------------------------------------------ siniestros
  {
    id: "siniestros",
    ruta: /^\/siniestros\/lista$/,
    titulo: "Siniestros",
    pasos: [
      tarjetas("Abiertos, sin movimiento, cerrados por cobrar y cerrados. «Sin movimiento» son expedientes detenidos que conviene revisar."),
      { ancla: a("acciones"), titulo: "Nuevo expediente", texto: "Elija el tipo de siniestro; el sistema le da un número SIN-AAAA-NNNN y su flujo de etapas." },
      filtros("por expediente, placa o descripción"),
      tabla("Pulse un expediente para seguir sus etapas, importes y cobro."),
      ayuda,
    ],
  },
  {
    id: "siniestro-nuevo",
    ruta: /^\/siniestros\/nuevo$/,
    titulo: "Nuevo expediente",
    pasos: [
      { ancla: s("Datos del siniestro"), titulo: "Datos del siniestro", texto: "Tipo, fechas del evento y de notificación, lugar y descripción. Marque «Confidencial» si involucra datos de salud de una persona." },
    ],
  },
  {
    id: "siniestro",
    ruta: /^\/siniestros\/\d+$/,
    titulo: "Expediente de siniestro",
    pasos: [
      { ancla: s("Etapas"), titulo: "Etapas", texto: "El flujo del expediente. Al terminar una etapa pasa a la siguiente; los documentos requeridos se marcan al subirlos." },
      { ancla: s("Afectados y póliza"), titulo: "Afectados y póliza", texto: "Quién o qué resultó afectado y la póliza que responde. El vínculo con la póliza siempre es explícito." },
      { ancla: s("Importes"), titulo: "Importes", texto: "Presupuestado, autorizado y reconocido. Vale el último de cada tipo; los anteriores quedan como historial." },
      { ancla: s("Cuenta por cobrar del reembolso"), titulo: "Reembolso", texto: "Lo reconocido se cobra en Finanzas. Cerrar el expediente no cierra la cuenta por cobrar." },
      { ancla: s("Actuaciones"), titulo: "Actuaciones", texto: "Llamadas, visitas y gestiones. Mantienen el expediente «con movimiento»." },
      documentos,
      ayuda,
    ],
  },
  // ------------------------------------------------------------------ finanzas
  {
    id: "primas",
    ruta: /^\/finanzas\/primas$/,
    titulo: "Primas y cobros",
    pasos: [
      tarjetas("Saldos vencidos, por vencer, pendientes y pagados, por moneda. Pulse una tarjeta para filtrar."),
      filtros("por aseguradora o póliza"),
      tabla("Pulse una obligación para registrar pagos (o cobros) parciales y ver su saldo."),
      ayuda,
    ],
  },
  {
    id: "obligacion",
    ruta: /^\/finanzas\/primas\/\d+$/,
    titulo: "Obligación",
    pasos: [
      { ancla: s("Origen"), titulo: "Origen", texto: "De qué póliza, endoso o siniestro viene este saldo." },
      { titulo: "Pagos y saldo", texto: "Registre cada pago o cobro (puede ser parcial). El saldo se recalcula solo. Un pago mal registrado se anula con motivo; nunca se borra." },
      ayuda,
    ],
  },
  // ------------------------------------------------------------------ reportes
  {
    id: "tablero",
    ruta: /^\/reportes\/tablero$/,
    titulo: "Tablero gerencial",
    pasos: [
      { ancla: a("indicadores"), titulo: "Indicadores", texto: "Pólizas vigentes, primas, sumas aseguradas, saldos y siniestros. Los importes van por moneda: nunca se mezclan." },
      { ancla: s("Prima neta por ramo"), titulo: "Gráficas", texto: "Pase el cursor sobre una barra para ver su valor. Debajo está la tabla con los mismos datos." },
      { ancla: s("Pólizas por vencer"), titulo: "Lo que vence", texto: "Pólizas y primas próximas a vencer, con enlace a cada ficha." },
      ayuda,
    ],
  },
  {
    id: "reportes",
    ruta: /^\/reportes\/lista$/,
    titulo: "Reportes",
    pasos: [
      { ancla: a("tabla-reportes"), titulo: "Elija un reporte", texto: "Pólizas y vigencias, asegurados, detalle por CECO, saldos con antigüedad y siniestros." },
      ayuda,
    ],
  },
  {
    id: "reporte",
    ruta: /^\/reportes\/(?!lista$|tablero$)[a-z-]+$/,
    titulo: "Reporte",
    pasos: [
      filtros("y combinar filtros"),
      { ancla: a("exportar"), titulo: "Excel o PDF", texto: "«Excel» descarga todas las filas; «Imprimir o PDF» abre la impresión (elija «Guardar como PDF»)." },
      tabla("Los totales van al pie, por moneda. Copie el enlace del navegador para compartir el reporte con estos filtros."),
    ],
  },
  // ------------------------------------------------------------------ configuración
  {
    id: "configuracion",
    ruta: /^\/configuracion$/,
    titulo: "Configuración",
    pasos: [{ ancla: a("opciones-configuracion"), titulo: "Configuración", texto: "Usuarios, empresas, catálogos, reglas de cálculo, flujos y ajustes. Cada cambio queda en la bitácora." }],
  },
  {
    id: "usuarios",
    ruta: /^\/admin\/usuarios$/,
    titulo: "Usuarios",
    pasos: [
      { ancla: a("acciones"), titulo: "Nuevo usuario", texto: "Cree el usuario con una clave temporal: deberá cambiarla al entrar." },
      tabla("Pulse un usuario para darle rol por empresa (Analista o Consulta), permisos especiales o bloquearlo. Los usuarios no se borran."),
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
      { ancla: s("Nueva empresa"), titulo: "Nueva empresa", texto: "Código corto, nombre y RIF. Cada empresa se maneja por separado." },
      tabla("Las empresas no se borran: se desactivan y conservan su historial."),
    ],
  },
  {
    id: "catalogos",
    ruta: /^\/admin\/catalogos$/,
    titulo: "Catálogos",
    pasos: [
      { titulo: "Listas del sistema", texto: "Valores que aparecen en los formularios. Pulse un valor para activarlo o desactivarlo; nada se borra." },
      { ancla: s("Ramos y coberturas"), titulo: "Ramos y coberturas", texto: "Los ramos (automóvil, accidentes…) y sus coberturas, que luego llevan tarifas en cada póliza." },
      ayuda,
    ],
  },
  {
    id: "reglas",
    ruta: /^\/admin\/reglas$/,
    titulo: "Reglas de cálculo",
    pasos: [
      { ancla: s("Cómo se escriben las fórmulas"), titulo: "Fórmulas", texto: "Las variables y funciones que puede usar. Las tasas y primas fijas no van aquí: van en las tarifas de cada póliza." },
      { ancla: s("Reglas"), titulo: "Reglas", texto: "«Propuesta» es práctica de mercado pendiente de confirmar; «Aprobar» cuando coincida con el contrato. Una regla no se edita: se crea una versión nueva desde una fecha." },
      ayuda,
    ],
  },
  {
    id: "flujos",
    ruta: /^\/admin\/flujos$/,
    titulo: "Flujos de siniestros",
    pasos: [
      { ancla: s("Tipos de siniestro"), titulo: "Tipos y flujos", texto: "Cada tipo de siniestro usa un flujo de etapas con sus documentos requeridos." },
      { ancla: s("Nuevo flujo"), titulo: "Nuevo flujo", texto: "Cree un flujo con sus etapas en orden. Los expedientes abiertos conservan el flujo con que empezaron." },
      ayuda,
    ],
  },
  {
    id: "ajustes",
    ruta: /^\/ajustes$/,
    titulo: "Ajustes",
    pasos: [{ titulo: "Parámetros", texto: "Plazos de «por vencer», días sin movimiento de un siniestro, aviso de límites y tamaño de archivos. El cambio vale de inmediato." }],
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
      { ancla: a("recorridos-manual"), titulo: "Repetir recorridos", texto: "Desde aquí puede ver de nuevo la bienvenida o volver a mostrar todos los recorridos." },
    ],
  },
];

/** Recorrido de una ruta (null si la pantalla no tiene). */
export function recorridoDe(ruta: string): Recorrido | null {
  return RECORRIDOS.find((r) => r.ruta.test(ruta)) ?? null;
}
