"use server";

import { revalidatePath } from "next/cache";
import { registrarGestion } from "@/lib/auditoria";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { validarExpresion } from "@/lib/dominio/calculo/expresiones";
import { sumarDiasISO } from "@/lib/dominio/vigencias";
import type { EstadoAccion } from "@/lib/estado-accion";
import { erroresDeZod } from "@/lib/validations/comunes";
import { reglaSchema } from "@/lib/validations/polizas";

/**
 * Reglas de cálculo (Configuración, solo administrador). Una regla no se edita: se crea una versión
 * nueva desde una fecha y la anterior queda vigente hasta el día previo, así lo ya calculado
 * conserva la versión con que se calculó.
 */
const RUTA = "/admin/reglas";
const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "");
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function nuevaVersionRegla(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await requerirSesion();
  if (!tienePermiso(u, "admin.sistema")) return { error: "Solo el administrador cambia las reglas de cálculo." };
  const base = await db.reglas_calculo.findUnique({ where: { id: Number(texto(fd, "id")) || 0 } });
  if (!base) return { error: "La regla ya no existe." };
  if (base.vigente_hasta) return { error: "Esta versión ya fue reemplazada: crea la nueva desde la versión vigente." };
  const entrada = reglaSchema.safeParse({
    expresion: texto(fd, "expresion"),
    base_dias: texto(fd, "base_dias"),
    metodo: texto(fd, "metodo"),
    vigente_desde: texto(fd, "vigente_desde"),
    estado: texto(fd, "estado"),
    descripcion: texto(fd, "descripcion"),
  });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  if (d.vigente_desde <= iso(base.vigente_desde)) return { errores: { vigente_desde: `Debe ser posterior al ${iso(base.vigente_desde)} (inicio de la versión actual)` } };
  if (base.tipo === "prorrateo") {
    if (!d.metodo) return { errores: { metodo: "Elige el método" } };
    if (d.metodo === "dias" && !d.base_dias) return { errores: { base_dias: "Elige la base de días" } };
  } else {
    if (!d.expresion) return { errores: { expresion: "Escribe la fórmula" } };
    const error = validarExpresion(d.expresion);
    if (error) return { errores: { expresion: error } };
  }
  await db.$transaction(async (tx) => {
    await tx.reglas_calculo.update({ where: { id: base.id }, data: { vigente_hasta: new Date(`${sumarDiasISO(d.vigente_desde, -1)}T00:00:00Z`) } });
    const nueva = await tx.reglas_calculo.create({
      data: {
        nombre: base.nombre, tipo: base.tipo, empresa: base.empresa, id_aseguradora: base.id_aseguradora, id_poliza: base.id_poliza, id_ramo: base.id_ramo, id_cobertura: base.id_cobertura,
        expresion: base.tipo === "prorrateo" ? null : d.expresion, evento: base.evento, metodo: base.tipo === "prorrateo" ? d.metodo : null,
        base_dias: base.tipo === "prorrateo" && d.metodo === "dias" ? d.base_dias : null, decimales: base.decimales, estado: d.estado, version: base.version + 1,
        id_regla_anterior: base.id, vigente_desde: new Date(`${d.vigente_desde}T00:00:00Z`), descripcion: d.descripcion ?? base.descripcion, creado_por: u.id,
      },
    });
    await registrarGestion(
      u.id,
      "REGLAS",
      `REGLA «${base.nombre}» v${nueva.version} desde ${d.vigente_desde} (${d.estado}): ${base.tipo === "prorrateo" ? `${d.metodo} ${d.base_dias ?? ""}` : `'${base.expresion}' -> '${d.expresion}'`}`,
      tx,
      { entidad: "reglas_calculo", idRegistro: nueva.id, operacion: "VERSION" },
    );
  });
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Nueva versión creada. Los cálculos anteriores conservan la versión con que se hicieron." };
}

/** Aprueba una regla propuesta (confirmada con el contrato) o la retira. */
export async function cambiarEstadoRegla(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await requerirSesion();
  if (!tienePermiso(u, "admin.sistema")) return { error: "Solo el administrador cambia las reglas de cálculo." };
  const r = await db.reglas_calculo.findUnique({ where: { id: Number(texto(fd, "id")) || 0 } });
  const estado = texto(fd, "estado");
  if (!r || !["aprobada", "retirada"].includes(estado)) return { error: "Operación no válida." };
  await db.$transaction(async (tx) => {
    await tx.reglas_calculo.update({ where: { id: r.id }, data: { estado } });
    await registrarGestion(u.id, "REGLAS", `REGLA «${r.nombre}» v${r.version}: ${r.estado.toUpperCase()} -> ${estado.toUpperCase()}`, tx, { entidad: "reglas_calculo", idRegistro: r.id, operacion: "ESTADO" });
  });
  revalidatePath(RUTA);
  return { ok: true, mensaje: estado === "aprobada" ? "Regla aprobada." : "Regla retirada." };
}
