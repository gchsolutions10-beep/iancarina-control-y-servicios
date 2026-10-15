import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { UsuarioActual } from "@/lib/auth/dal";
import { sinPermiso } from "@/lib/fichas/acceso";
import { aseguradoSchema } from "@/lib/validations/polizas";
import { nombreParte } from "@/lib/validations/fichas";

/** Auxiliares de las acciones de pólizas y endosos (fuera de "use server": no son acciones). */
const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "");

/** Período y su póliza, con el permiso de registrar verificado en su empresa. */
export async function periodoEditable(usuario: UsuarioActual, idTexto: string, estados: string[] = ["borrador"]) {
  const id = /^\d+$/.test(idTexto) ? BigInt(idTexto) : null;
  const periodo = id ? await db.poliza_periodos.findUnique({ where: { id }, include: { polizas: { include: { ramos: true } } } }) : null;
  if (!periodo) return { error: "El período ya no existe." } as const;
  const negado = sinPermiso(usuario, periodo.empresa, "seguros.registrar");
  if (negado) return { error: negado } as const;
  if (!estados.includes(periodo.estado)) {
    return { error: periodo.estado === "confirmado" ? "El período está confirmado: los cambios se hacen por endoso." : "El período está anulado." } as const;
  }
  return { periodo } as const;
}

export async function parteDeEmpresa(id: bigint, empresa: string) {
  const p = await db.partes.findUnique({ where: { id }, select: { empresa: true, estado: true, tipo: true, nombres: true, apellidos: true, razon_social: true, funciones: true } });
  return p && p.empresa === empresa && p.estado === "activa" ? p : null;
}

/** Lee el formulario de asegurado (común a la preparación y al endoso de alta). */
export async function leerAsegurado(fd: FormData) {
  return aseguradoSchema.safeParse({
    id_sujeto: texto(fd, "id_sujeto"),
    certificado: texto(fd, "certificado"),
    ceco: texto(fd, "ceco"),
    clase_tarifa: texto(fd, "clase_tarifa"),
    desde: texto(fd, "desde"),
    valor_bien: texto(fd, "valor_bien"),
    aditamentos: texto(fd, "aditamentos"),
    suma_asegurada: texto(fd, "suma_asegurada"),
    coberturas: fd.getAll("coberturas").map(String),
    observaciones: texto(fd, "observaciones"),
  });
}

/** Verifica que la ficha exista, esté activa y sea de la empresa; devuelve la columna y su nombre. */
export async function sujetoValido(sujeto: string, id: bigint, empresa: string) {
  if (sujeto === "vehiculo") {
    const v = await db.vehiculos.findUnique({ where: { id }, select: { empresa: true, estado: true, placa: true, tipo_vehiculo: true } });
    return v && v.empresa === empresa && v.estado === "activo" ? { columna: "id_vehiculo" as const, nombre: v.placa, clase: v.tipo_vehiculo, valor: null } : null;
  }
  if (sujeto === "propiedad") {
    const p = await db.propiedades.findUnique({ where: { id }, select: { empresa: true, estado: true, nombre: true, valor_declarado: true } });
    return p && p.empresa === empresa && p.estado === "activa" ? { columna: "id_propiedad" as const, nombre: p.nombre, clase: null, valor: p.valor_declarado?.toFixed(2) ?? null } : null;
  }
  const p = await parteDeEmpresa(id, empresa);
  return p && p.tipo === "natural" ? { columna: "id_persona" as const, nombre: nombreParte(p), clase: null, valor: null } : null;
}

export async function siguienteEndoso(tx: Prisma.TransactionClient, idPeriodo: bigint) {
  const ultimo = await tx.endosos.aggregate({ where: { id_periodo: idPeriodo }, _max: { numero: true } });
  return (ultimo._max.numero ?? 0) + 1;
}

