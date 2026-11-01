import "server-only";
import { tienePermiso, type UsuarioActual } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { empresasDe } from "@/lib/fichas/acceso";

/**
 * «Primeros pasos» en Inicio: las tareas para empezar a usar el sistema, en orden. Cada una se marca
 * sola cuando ya hay datos que la cumplen y lleva a su pantalla con el recorrido guiado abierto.
 */
export type PrimerPaso = { id: string; titulo: string; texto: string; hecho: boolean | null; enlace: string };

export const ID_PRIMEROS_PASOS = "primeros-pasos";
const guiado = (ruta: string) => `${ruta}${ruta.includes("?") ? "&" : "?"}recorrido=1`;

export async function primerosPasos(usuario: UsuarioActual): Promise<PrimerPaso[] | null> {
  const admin = tienePermiso(usuario, "admin.sistema");
  const empresas = empresasDe(usuario, "seguros.registrar");
  if (!admin && empresas.length === 0) return null; // los usuarios de consulta no registran
  const e = { empresa: { in: empresas } };
  const [nEmpresas, nUsuarios, aseguradoras, vehiculos, propiedades, polizas, asegurados, confirmados, pagos, siniestros, enPreparacion] = await Promise.all([
    db.app_empresas.count({ where: { activa: true } }),
    db.app_usuarios.count({ where: { bloqueado: false } }),
    db.partes.count({ where: { ...e, estado: { not: "fusionada" }, funciones: { has: "Aseguradora" } } }),
    db.vehiculos.count({ where: e }),
    db.propiedades.count({ where: e }),
    db.polizas.count({ where: e }),
    db.inclusiones.count({ where: e }),
    db.poliza_periodos.count({ where: { ...e, estado: "confirmado" } }),
    db.pagos.count({ where: { ...e, estado: { not: "anulado" } } }),
    db.siniestros.count({ where: e }),
    db.poliza_periodos.findFirst({ where: { ...e, estado: "borrador" }, orderBy: { id: "desc" }, select: { id: true } }),
  ]);
  const periodo = enPreparacion ? `/polizas/periodos/${enPreparacion.id}` : "/polizas/lista";
  return [
    ...(admin
      ? [
          { id: "empresas", titulo: "Crear la empresa", texto: "Todos los datos pertenecen a una empresa del grupo.", hecho: nEmpresas > 0, enlace: guiado("/admin/empresas") },
          { id: "usuarios", titulo: "Dar acceso al equipo", texto: "Cree un usuario por persona y elija su rol en cada empresa: Analista (registra) o Consulta (solo ve).", hecho: nUsuarios > 1, enlace: guiado("/admin/usuarios") },
        ]
      : []),
    { id: "aseguradora", titulo: "Registrar la aseguradora", texto: "En Personas → Nueva ficha → Empresa, marcando la función «Aseguradora». Haga lo mismo con el corredor si hay.", hecho: aseguradoras > 0, enlace: guiado("/personas/nueva?tipo=juridica") },
    { id: "bienes", titulo: "Registrar lo que se asegura", texto: "Los vehículos (con sus toneladas), las propiedades o las personas que se van a asegurar.", hecho: vehiculos + propiedades > 0, enlace: guiado("/activos/vehiculos/nuevo") },
    { id: "poliza", titulo: "Crear la póliza", texto: "Aseguradora, número, ramo, vigencia y moneda, como dice el cuadro de póliza.", hecho: polizas > 0, enlace: guiado("/polizas/nueva") },
    { id: "asegurados", titulo: "Cargar tarifas y asegurados, y calcular", texto: "En la vigencia de la póliza: las tarifas del contrato, cada asegurado con su suma y CECO, y «Calcular primas».", hecho: asegurados > 0, enlace: guiado(periodo) },
    { id: "confirmar", titulo: "Confirmar la vigencia", texto: "Revisa que no falte nada y genera la prima por pagar a la aseguradora.", hecho: confirmados > 0, enlace: guiado(periodo) },
    { id: "pago", titulo: "Registrar el pago de la prima", texto: "En Finanzas → Primas por pagar, abra la prima y registre el pago (puede ser parcial).", hecho: pagos > 0, enlace: guiado("/finanzas/primas") },
    { id: "siniestro", titulo: "Registrar un siniestro (cuando ocurra)", texto: "Choque, robo, accidente o pérdida: un expediente con sus etapas, montos y el reembolso a cobrar.", hecho: siniestros > 0, enlace: guiado("/siniestros/lista") },
    { id: "tablero", titulo: "Revisar el tablero y los reportes", texto: "Primas, saldos y vencimientos de un vistazo; reportes en Excel o PDF.", hecho: null, enlace: guiado("/reportes/tablero") },
  ];
}
