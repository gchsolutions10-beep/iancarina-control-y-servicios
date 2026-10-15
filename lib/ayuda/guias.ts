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
    para: "Tener una sola ficha por persona o empresa (socio, propietario, asegurado, beneficiario, aseguradora, taller, transportista) con sus relaciones, bienes, documentos e historial.",
    pasos: [
      "Busque primero por nombre o identificación: si ya existe, use esa ficha.",
      "Pulse «Nueva ficha», elija persona natural o empresa y complete la identificación y el nombre.",
      "En la ficha, agregue su relación con la empresa (socio, accionista…) con fecha de inicio.",
      "Suba documentos (identificación, actas) y, si corresponde, una foto.",
    ],
    tener: [
      "La identificación no se puede repetir dentro de la empresa. Si el nombre se parece a otra ficha, el sistema avisa antes de crearla.",
      "Ser socio o propietario no hace a la persona asegurada: eso se indica en cada póliza.",
      "Los datos personales (nacimiento, contacto, dirección) solo los ve quien tiene ese permiso.",
      "Cada cambio queda en el historial de la ficha.",
    ],
    evitar: ["No cree una segunda ficha para la misma persona: corrija la existente.", "No escriba datos personales que la póliza no exige."],
  },
  {
    id: "relaciones-empresa",
    titulo: "Socios y propietarios",
    quien: "Todos los usuarios de la empresa.",
    para: "Ver quiénes son hoy socios, accionistas o propietarios de la empresa (o todas las relaciones, con las terminadas).",
    pasos: ["Elija «Vigentes hoy» o «Todas».", "Pulse el nombre para abrir la ficha y agregar o terminar relaciones."],
    tener: ["Las relaciones no se borran: se terminan con fecha y quedan en el historial."],
    evitar: ["No termine una relación con una fecha anterior a su inicio."],
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
    para: "Mantener las listas de los formularios: marcas y modelos, colores, tipos de vehículo e inmueble, relaciones, documentos.",
    pasos: ["Escriba el nuevo valor y pulse «Agregar».", "Pulse un valor para desactivarlo (deja de aparecer en los formularios) o activarlo de nuevo."],
    tener: ["Nada se borra: los registros que ya usan un valor lo conservan.", "Cada cambio queda en la bitácora."],
    evitar: ["No cambie el sentido de un valor en uso: desactívelo y cree otro."],
  },
];

export const GUIAS: Record<string, Guia> = Object.fromEntries(lista.map((g) => [g.id, g]));
export function guia(id: string): Guia {
  const g = GUIAS[id];
  if (!g) throw new Error(`Falta la guía «${id}» en lib/ayuda/guias.ts`);
  return g;
}
