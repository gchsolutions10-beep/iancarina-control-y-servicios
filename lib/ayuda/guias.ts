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
];

export const GUIAS: Record<string, Guia> = Object.fromEntries(lista.map((g) => [g.id, g]));
export function guia(id: string): Guia {
  const g = GUIAS[id];
  if (!g) throw new Error(`Falta la guía «${id}» en lib/ayuda/guias.ts`);
  return g;
}
