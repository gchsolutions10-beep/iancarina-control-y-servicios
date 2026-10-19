import type { Guia } from "./tipos";

/**
 * Guías de uso por módulo (botón «i»). Al crear o cambiar un módulo, actualiza su guía:
 * es el manual del usuario de ese formulario. Mismo id que en lib/modulos.ts.
 */
const lista: Guia[] = [
  {
    id: "usuarios",
    titulo: "Usuarios",
    quien: "El administrador (o quien tenga «Gestionar usuarios» en una empresa).",
    para: "Dar acceso a cada persona solo a las empresas que le corresponden, como analista (ve e ingresa) o consulta (solo ve).",
    pasos: [
      "Pulse «Nuevo usuario», escriba usuario, nombre y una clave temporal.",
      "En cada empresa, elija el rol: Analista o Consulta. Deje vacío para no darle acceso.",
      "Si hace falta, agregue permisos excepcionales (ver datos personales, anular movimientos).",
      "Entregue la clave temporal: el usuario deberá cambiarla al entrar.",
    ],
    tener: ["Todo cambio de usuarios y permisos queda en la bitácora.", "Un rol con fecha «hasta» deja de valer al terminar ese día."],
    evitar: ["No borre usuarios: bloquéelos, así se conserva la autoría de lo que registraron."],
  },
  {
    id: "empresas",
    titulo: "Empresas",
    quien: "Solo el administrador.",
    para: "Registrar las empresas del grupo. Cada una se maneja por separado y sus datos solo los ven los usuarios con rol en ella.",
    pasos: [
      "En «Nueva empresa», escriba un código corto (ej.: mary-iancarina), el nombre y el RIF.",
      "Pulse «Crear empresa» y luego asígnele usuarios en «Usuarios».",
    ],
    tener: ["El código no cambia después de crear la empresa.", "Todo cambio queda en la bitácora."],
    evitar: ["No reutilice una empresa para otra: desactívela y cree una nueva, así se conserva su historial."],
  },
  {
    id: "personas",
    titulo: "Personas y empresas",
    quien: "Analistas (registran) y usuarios de consulta (solo ven) de cada empresa.",
    para: "Tener una sola ficha por persona o empresa (asegurado, beneficiario, propietario, aseguradora, taller, transportista) con sus bienes, documentos e historial.",
    pasos: [
      "Busque primero por nombre o identificación: si ya existe, use esa ficha.",
      "Pulse «Nueva ficha», elija persona natural o empresa y complete la identificación y el nombre.",
      "Suba documentos (identificación) y, si corresponde, una foto.",
    ],
    tener: [
      "La identificación no se puede repetir dentro de la empresa. Si el nombre se parece a otra ficha, el sistema avisa antes de crearla.",
      "Los datos personales (nacimiento, contacto, dirección) solo los ve quien tiene ese permiso.",
      "Cada cambio queda en el historial de la ficha.",
    ],
    evitar: ["No cree una segunda ficha para la misma persona: corrija la existente.", "No escriba datos personales que la póliza no exige."],
  },
  {
    id: "vehiculos",
    titulo: "Vehículos",
    quien: "Analistas (registran) y usuarios de consulta (solo ven) de cada empresa.",
    para: "Ficha única de cada vehículo propio o de terceros, con propietario legal, responsable, fotos, documentos e historial.",
    pasos: [
      "Pulse «Nuevo vehículo», escriba la placa y sus datos (marca, modelo, año, tipo, color).",
      "En la ficha, registre el propietario legal y el responsable administrativo.",
      "Suba las fotos y documentos (certificado de registro, título).",
      "Si se vende o retira, use «Venta o baja» con la fecha efectiva.",
    ],
    tener: [
      "La placa no se repite entre los vehículos activos de la empresa.",
      "Un vehículo vendido no se borra: queda en el historial y no entra en renovaciones que empiecen después de la venta.",
      "Al cambiar de propietario, el anterior termina el día previo y queda registrado.",
    ],
    evitar: ["No reutilice la ficha de un vehículo vendido para otro vehículo."],
  },
  {
    id: "propiedades",
    titulo: "Propiedades",
    quien: "Analistas (registran) y usuarios de consulta (solo ven) de cada empresa.",
    para: "Ficha de casas, edificios, galpones e instalaciones asegurables, con propietario, valor declarado, fotos y documentos.",
    pasos: [
      "Pulse «Nueva propiedad», escriba el nombre, tipo y dirección.",
      "Si se conoce, indique el valor declarado con su moneda.",
      "En la ficha, registre el propietario y suba fotos y documentos.",
    ],
    tener: ["El valor declarado siempre lleva moneda; el sistema no convierte monedas.", "Las bajas quedan en el historial."],
    evitar: ["No borre ni reutilice una propiedad vendida: regístrela como baja."],
  },
  {
    id: "catalogos",
    titulo: "Catálogos",
    quien: "Solo el administrador.",
    para: "Mantener las listas de los formularios: marcas y modelos, ramos y coberturas, colores, tipos de vehículo e inmueble y documentos.",
    pasos: ["Escriba el nuevo valor y pulse «Agregar».", "Pulse un valor para desactivarlo (deja de aparecer en los formularios) o activarlo de nuevo."],
    tener: ["Nada se borra: los registros que ya usan un valor lo conservan.", "Cada cambio queda en la bitácora."],
    evitar: ["No cambie el sentido de un valor en uso: desactívelo y cree otro."],
  },
  {
    id: "polizas",
    titulo: "Pólizas",
    quien: "Analistas (registran) y usuarios de consulta (solo ven) de cada empresa.",
    para: "Llevar cada póliza con sus vigencias, tomador, asegurados (personas, vehículos o propiedades), coberturas, tarifas, primas calculadas, endosos y beneficiarios.",
    pasos: [
      "Pulse «Nueva póliza»: aseguradora, número, ramo, moneda, vigencia y tomador. Se crea el período 1 «En preparación».",
      "En el período, cargue las tarifas del contrato: tasa anual (%) de casco y prima fija de RCV (por tipo de vehículo) y demás coberturas.",
      "Agregue los asegurados con sus coberturas. Para vehículos indique valor y aditamentos: la suma asegurada se calcula sola.",
      "Pulse «Calcular primas» y revise cada prima, la regla usada y lo que falte. Si la aseguradora indica otro importe, use «Usar la prima que indicó la aseguradora» con el motivo.",
      "Pulse «Confirmar período» con el vencimiento del pago: se genera la prima por pagar.",
      "Después, cualquier cambio (alta, baja por venta, cambio de tomador o beneficiario) es un endoso: pulse «Simular», revise y «Confirmar endoso».",
    ],
    tener: [
      "Las fórmulas vienen de la propuesta de mercado (marcadas «Propuesta») hasta confirmarlas con el contrato; cada prima muestra la regla que la calculó.",
      "Si falta un dato (una tasa, el valor del vehículo), el cálculo queda como simulación y el sistema no deja confirmar: dice exactamente qué falta.",
      "Las fechas van como en la póliza: la vigencia 01/01 → 01/01 del año siguiente son 365 días. Un alta a mitad de año paga la prorrata de los días que faltan (÷ 365).",
      "Una baja devuelve la prima de los días restantes; queda como devolución por cobrar.",
      "Ser tomador o propietario no hace a nadie asegurado: cada rol se registra aparte.",
    ],
    evitar: [
      "No borre ni reescriba un período confirmado: use endosos (el sistema no lo permite).",
      "No mezcle monedas: cada período tiene una moneda y no se convierte.",
    ],
  },
  {
    id: "renovaciones",
    titulo: "Renovación anual",
    quien: "Analistas de cada empresa.",
    para: "Preparar la vigencia del año siguiente partiendo de la anterior, sin perder el histórico, y compararla año contra año.",
    pasos: [
      "En «Por renovar» aparecen las vigencias que terminan pronto (o ya terminaron). Pulse «Preparar renovación».",
      "El sistema copia tomador y partes, tarifas, asegurados elegibles con sus coberturas y beneficiarios, y los valores del año anterior.",
      "Revise la lista «No pasaron a este período» (vehículos vendidos antes del inicio, bajas por endoso, fichas inactivas).",
      "Actualice tarifas y valores si cambiaron, pulse «Calcular primas» y revise la comparación por cobertura y por CECO.",
      "Confirme el período para generar la prima por pagar.",
    ],
    tener: [
      "Un vehículo vendido antes del inicio de la nueva vigencia no se copia; si se vende después, sigue y se da de baja por endoso.",
      "El período anterior no cambia: la comparación siempre usa sus valores originales.",
      "Si la renovación no procede, use «Descartar este período»: queda anulada con su motivo.",
    ],
    evitar: ["No cree la póliza de nuevo para renovarla: así se pierde la comparación interanual."],
  },
  {
    id: "primas-por-pagar",
    titulo: "Primas por pagar",
    quien: "Analistas (registran pagos) y usuarios de consulta; anular un pago exige el permiso «Anular y ajustar».",
    para: "Controlar lo que se debe a cada aseguradora por períodos y endosos confirmados, los pagos parciales y las devoluciones por cobrar.",
    pasos: [
      "Use las tarjetas (vencidas, por vencer, pendientes, pagadas) para filtrar.",
      "Abra una obligación y registre el pago con su fecha, monto y referencia. Puede ser parcial.",
      "Para ver lo que las aseguradoras deben devolver por bajas, pulse «Ver devoluciones por cobrar».",
    ],
    tener: [
      "El saldo siempre sale de los pagos imputados; las monedas se muestran por separado y nunca se convierten.",
      "Un pago no se borra: se anula con motivo y su imputación se revierte con un registro inverso.",
    ],
    evitar: ["No registre un pago en otra moneda que la de la obligación: el sistema lo rechaza."],
  },
  {
    id: "reglas",
    titulo: "Reglas de cálculo",
    quien: "Solo el administrador.",
    para: "Configurar cómo se calculan sumas aseguradas, primas y prorratas, sin tocar el programa.",
    pasos: [
      "Revise cada regla «Propuesta» contra el contrato o el cuadro de la aseguradora.",
      "Si coincide, pulse «Aprobar». Si no, cree una «Nueva versión» con la fórmula o el método correctos y la fecha desde la que vale.",
      "¿Aprobó por error? Pulse «Volver a propuesta»: la regla recupera la marca «Propuesta».",
      "¿Creó una versión por error y todavía no se usó en ningún cálculo? Pulse «Deshacer versión»: se retira y la versión anterior vuelve a valer sin fecha de fin.",
    ],
    tener: [
      "«Aprobar» no cambia ningún importe: solo indica que la fórmula ya se verificó con el contrato y quita la marca «Propuesta» de los cálculos.",
      "Las tasas y primas fijas no van en las reglas: se cargan en las tarifas de cada período (cambian año a año).",
      "Lo ya calculado conserva la versión con que se calculó; la versión anterior sigue valiendo hasta el día previo.",
      "Gana la regla más específica (póliza › aseguradora › cobertura › ramo › general).",
    ],
    evitar: ["No apruebe una propuesta sin verificarla con un caso resuelto por la aseguradora."],
  },
  {
    id: "base-datos",
    titulo: "Programador (base de datos)",
    quien: "Solo el administrador.",
    para: "Cargar datos de ejemplo para presentar el sistema, dejarlo en blanco cuando haga falta y revisar o corregir registros con cuidado.",
    pasos: [
      "«Datos de ejemplo»: elija la empresa de demostración y pulse «Cargar datos de ejemplo» (solo existe en la demo).",
      "«Limpiar datos»: marque qué borrar (pagos, pólizas, vehículos y propiedades, personas), elija la empresa, escriba el motivo y LIMPIAR.",
      "«Tablas y vistas»: abra una tabla, filtre y pulse una fila para corregirla. «Consola SQL»: consultas en solo lectura salvo que marque «Permitir cambios».",
    ],
    tener: [
      "La limpieza es una sola operación: si algo falla no se borra nada. Arrastra lo que depende de lo elegido.",
      "No se borran empresas, usuarios, ajustes, catálogos, reglas generales ni la bitácora: la limpieza queda registrada con su motivo.",
      "Editar filas sigue respetando las reglas de la base: un período confirmado no se modifica desde aquí.",
    ],
    evitar: ["No use la consola SQL para el trabajo diario: todo cambio debe hacerse desde su pantalla para que quede bien registrado."],
  },
  {
    id: "siniestros",
    titulo: "Siniestros",
    quien: "Analistas (registran) y usuarios de consulta (solo ven). Los de personas solo los ve quien tiene «Ver datos personales».",
    para: "Llevar cada expediente de vehículos, personas y propiedades: afectados, póliza que responde, etapas, importes, reembolso por cobrar, actuaciones y documentos.",
    pasos: [
      "Pulse «Nuevo expediente», elija el tipo y complete fechas, afectado y qué ocurrió. El número SIN-AAAA-NNNN se asigna solo.",
      "En el expediente, use «Vincular póliza» para indicar la póliza y cobertura que responde (solo aparecen las que lo cubrían ese día).",
      "Registre los importes: presupuestado, autorizado y reconocido. Si cambian, registre el nuevo: el anterior queda en el historial.",
      "Suba los documentos de cada etapa y pulse «Terminar etapa y pasar a la siguiente».",
      "Con el reembolso reconocido, cree la cuenta por cobrar; los cobros se registran en Finanzas → Cuentas por cobrar.",
      "Al terminar, cierre el expediente. Registre actuaciones (llamadas, visitas) para que no quede «sin movimiento».",
    ],
    tener: [
      "Autorizado no es pagado y reconocido no es cobrado: lo cobrado sale solo de los cobros registrados.",
      "Cerrar el expediente no cierra la cuenta por cobrar: aparece en «Cerrados por cobrar» hasta cobrarse.",
      "Si la póliza tiene límites (riesgos diversos), el sistema avisa al acercarse y no deja pasar el 100 %, mostrando el cálculo del disponible.",
      "Los expedientes de personas son confidenciales: se ocultan a quien no tiene el permiso y cada consulta queda en la bitácora.",
    ],
    evitar: ["No borre ni reemplace un importe: registre el nuevo con su motivo.", "No vincule una póliza que no cubría al afectado en la fecha del evento."],
  },
  {
    id: "transporte",
    titulo: "Transporte contratado",
    quien: "Analistas de cada empresa.",
    para: "Registrar las pérdidas de mercancía que viajaba con transportistas externos y seguir su reclamo.",
    pasos: [
      "Pulse «Nuevo expediente», elija el transportista (empresa con la función «Transportista»), la placa o el vehículo propio, la mercancía y la guía.",
      "Registre la pérdida, los importes y las actuaciones como en cualquier siniestro.",
      "Si corresponde, cree la cuenta por cobrar al transportista o a la aseguradora.",
    ],
    tener: ["La póliza de los vehículos propios no cubre al transportista externo salvo que se vincule de forma explícita."],
    evitar: ["No registre la mercancía como un vehículo afectado."],
  },
  {
    id: "flujos",
    titulo: "Flujos de siniestros",
    quien: "Solo el administrador.",
    para: "Definir las etapas que recorre cada tipo de siniestro y los documentos que se esperan en cada una.",
    pasos: [
      "Abra una etapa para cambiar su nombre, orden o documentos requeridos; desactívela si ya no se usa.",
      "Use «Agregar etapa» o «Nuevo flujo» si hace falta otro recorrido.",
      "En «Tipos de siniestro», elija qué flujo sigue cada tipo o agregue uno nuevo.",
    ],
    tener: [
      "El flujo «General (provisional)» se cargó para personas, propiedades y transporte mientras el cliente define los suyos.",
      "Un expediente conserva el flujo con que se abrió; los cambios de etapas valen para lo que le falta recorrer.",
    ],
    evitar: ["No reutilice una etapa para otra cosa: cree una nueva y desactive la anterior."],
  },
  {
    id: "cuentas-por-cobrar",
    titulo: "Cuentas por cobrar",
    quien: "Analistas (registran cobros) y usuarios de consulta.",
    para: "Seguir los reembolsos de siniestros reconocidos y las devoluciones de prima por bajas hasta cobrarlos.",
    pasos: ["Use las tarjetas para ver lo vencido o por vencer.", "Abra una cuenta y registre cada cobro (puede ser parcial)."],
    tener: ["El saldo baja solo con cobros registrados; las monedas no se mezclan.", "Un cobro mal registrado se anula con motivo (permiso «Anular y ajustar»)."],
    evitar: ["No cierre el siniestro pensando que eso cobra el reembolso: el saldo sigue aquí."],
  },
  {
    id: "tablero",
    titulo: "Tablero gerencial",
    quien: "Todos los usuarios, con los datos de sus empresas.",
    para: "Ver de un vistazo las pólizas vigentes, primas, sumas aseguradas, saldos por pagar y por cobrar, siniestros y lo que vence pronto.",
    pasos: [
      "Elija la empresa (si ve varias) y la moneda de las gráficas.",
      "Pulse una póliza o una prima de las tablas de abajo para ir a su ficha.",
      "Para el detalle, vaya a Reportes: cada indicador tiene su reporte con filtros y Excel.",
    ],
    tener: [
      "Los importes se muestran por moneda: el sistema nunca suma ni convierte monedas.",
      "Prima neta = prima inicial de la vigencia + endosos confirmados (altas suman, bajas restan).",
      "Las cifras salen de los mismos datos de las pantallas: un pago o un endoso se refleja al instante.",
    ],
    evitar: ["No tome las primas «Propuesta» como definitivas: dependen de las reglas aún sin confirmar con cada contrato."],
  },
  {
    id: "reportes",
    titulo: "Reportes",
    quien: "Todos los usuarios, con los datos de sus empresas.",
    para: "Sacar listados de pólizas y vigencias, asegurados, primas por CECO, saldos por pagar y por cobrar con antigüedad, y siniestros.",
    pasos: [
      "Elija un reporte y combine los filtros: las listas y fechas se aplican solas; los textos con Enter.",
      "Quite un filtro con la «x» de su etiqueta, o todos con «Limpiar filtros».",
      "Pulse «Excel» para descargar todas las filas, o «Imprimir o PDF» y elija «Guardar como PDF».",
      "Copie el enlace de la barra del navegador para compartir el reporte con los mismos filtros.",
    ],
    tener: [
      "Los totales van por moneda al pie de la tabla.",
      "Los siniestros confidenciales salen sin datos de la persona si su usuario no tiene «Ver datos personales».",
      "En pantalla se muestran hasta 500 filas; Excel e impresión traen todas.",
    ],
    evitar: ["No edite el Excel para corregir datos: corrija en el sistema y vuelva a descargar."],
  },
  {
    id: "detalle-ceco",
    titulo: "Detalle por CECO",
    quien: "Todos los usuarios, con los datos de sus empresas.",
    para: "Repartir la prima de las vigencias confirmadas por centro de costo y cobertura, para cargarla a cada área.",
    pasos: [
      "Elija la fecha de corte («Vigencias al») y, si quiere, el ramo.",
      "Descargue el Excel para el reparto contable.",
    ],
    tener: [
      "Prima neta = prima de cada asegurado (inicial y altas por endoso) menos las devoluciones por bajas.",
      "El CECO es el que se cargó en cada asegurado de la póliza; sin CECO sale «Sin CECO».",
    ],
    evitar: ["No cambie el CECO en el Excel: el reparto debe salir del sistema para que cuadre con las pólizas."],
  },
  {
    id: "ajustes",
    titulo: "Ajustes",
    quien: "El administrador (y GCH para los ajustes técnicos).",
    para: "Cambiar parámetros del sistema sin tocar el programa: plazos de «por vencer», días sin movimiento de un siniestro, aviso de límites y tamaño de archivos.",
    pasos: ["Busque el parámetro en su grupo (Pólizas, Finanzas, Siniestros, Archivos).", "Cambie el valor y pulse «Guardar»: vale de inmediato para todos los usuarios."],
    tener: ["Cada cambio queda en la bitácora con el valor anterior."],
    evitar: ["No suba el tamaño máximo de archivos por encima de 4 MB en la demo de Vercel."],
  },
];

/** Reglas que valen en todo el sistema (encabezan «Manual»). */
export const REGLAS_GENERALES = [
  "Cada usuario ve solo las empresas donde tiene rol: Analista (ve y registra) o Consulta (solo ve).",
  "Nada se borra: los registros se dan de baja, los pagos se anulan con motivo y las pólizas confirmadas se cambian por endoso.",
  "Los importes siempre llevan su moneda y el sistema nunca suma ni convierte monedas distintas.",
  "Las vigencias van desde el día de inicio hasta el día anterior a la fecha «hasta» que dice la póliza.",
  "Lo marcado «Propuesta» es práctica de mercado pendiente de confirmar con cada contrato.",
  "Todo cambio queda en la bitácora con su usuario y se ve en el «Historial» de cada ficha.",
  "El botón «i» junto al título de cada pantalla muestra su guía; este manual las reúne todas.",
];

export const GUIAS: Record<string, Guia> = Object.fromEntries(lista.map((g) => [g.id, g]));
export function guia(id: string): Guia {
  const g = GUIAS[id];
  if (!g) throw new Error(`Falta la guía «${id}» en lib/ayuda/guias.ts`);
  return g;
}
