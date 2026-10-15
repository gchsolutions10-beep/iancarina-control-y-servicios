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
    ],
    tener: [
      "Las tasas y primas fijas no van en las reglas: se cargan en las tarifas de cada período (cambian año a año).",
      "Lo ya calculado conserva la versión con que se calculó; la versión anterior sigue valiendo hasta el día previo.",
      "Gana la regla más específica (póliza › aseguradora › cobertura › ramo › general).",
    ],
    evitar: ["No apruebe una propuesta sin verificarla con un caso resuelto por la aseguradora."],
  },
];

export const GUIAS: Record<string, Guia> = Object.fromEntries(lista.map((g) => [g.id, g]));
export function guia(id: string): Guia {
  const g = GUIAS[id];
  if (!g) throw new Error(`Falta la guía «${id}» en lib/ayuda/guias.ts`);
  return g;
}
