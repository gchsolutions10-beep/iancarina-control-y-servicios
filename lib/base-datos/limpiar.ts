import "server-only";
import { registrarGestion } from "@/lib/auditoria";
import { borrarContenidos } from "@/lib/archivos/almacen";
import { db } from "@/lib/db";
import { GRUPOS, ORDEN, pasosDe, type Grupo } from "./grupos";

/**
 * Limpieza de datos de negocio por grupos y empresas (solo administrador). Corre en una sola
 * transacción: si algo falla, no se borra nada. Los disparadores que protegen los registros
 * (períodos confirmados, movimientos, pagos) se suspenden solo dentro de esa transacción. Al final se
 * borran los archivos que quedaron sin uso (registro y contenido en el almacenamiento).
 */

const tabla = (t: string) => `cys."${t.replaceAll('"', '""')}"`;

/** Cuántos registros tiene cada grupo en las empresas indicadas (para mostrar antes de limpiar). */
export async function conteos(empresas: string[]) {
  const resultado = {} as Record<Grupo, { tabla: string; filas: number }[]>;
  for (const g of ORDEN) {
    resultado[g] = [];
    for (const p of GRUPOS[g].pasos) {
      const filas = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM ${tabla(p.tabla)} WHERE empresa = ANY($1::text[])${"donde" in p ? ` AND ${p.donde}` : ""}`,
        empresas,
      );
      resultado[g].push({ tabla: p.tabla, filas: Number(filas[0].n) });
    }
  }
  return resultado;
}

export async function limpiar(grupos: Grupo[], empresas: string[], usuario: number, motivo: string) {
  const pasos = pasosDe(grupos);
  const protegidas = [...new Set(pasos.filter((p) => "protegida" in p && p.protegida).map((p) => p.tabla))];
  const detalle: string[] = [];

  const archivos = await db.$transaction(
    async (tx) => {
      for (const t of protegidas) await tx.$executeRawUnsafe(`ALTER TABLE ${tabla(t)} DISABLE TRIGGER USER`);
      for (const p of pasos) {
        const n = await tx.$executeRawUnsafe(`DELETE FROM ${tabla(p.tabla)} WHERE empresa = ANY($1::text[])${"donde" in p ? ` AND ${p.donde}` : ""}`, empresas);
        if (n) detalle.push(`${p.tabla}: ${n}`);
      }
      for (const t of protegidas) await tx.$executeRawUnsafe(`ALTER TABLE ${tabla(t)} ENABLE TRIGGER USER`);

      // Ramos y coberturas de ejemplo «(DEMO)» que ya nadie usa.
      if (grupos.includes("polizas")) {
        await tx.$executeRawUnsafe(`
          DELETE FROM cys.coberturas c WHERE c.nombre LIKE '%(DEMO)'
             AND NOT EXISTS (SELECT 1 FROM cys.inclusion_coberturas x WHERE x.id_cobertura = c.id)
             AND NOT EXISTS (SELECT 1 FROM cys.periodo_tarifas x WHERE x.id_cobertura = c.id)
             AND NOT EXISTS (SELECT 1 FROM cys.reglas_calculo x WHERE x.id_cobertura = c.id)
             AND NOT EXISTS (SELECT 1 FROM cys.coberturas h WHERE h.id_padre = c.id)`);
        await tx.$executeRawUnsafe(`
          DELETE FROM cys.ramos r WHERE r.nombre LIKE '%(DEMO)'
             AND NOT EXISTS (SELECT 1 FROM cys.polizas x WHERE x.id_ramo = r.id)
             AND NOT EXISTS (SELECT 1 FROM cys.coberturas x WHERE x.id_ramo = r.id)
             AND NOT EXISTS (SELECT 1 FROM cys.reglas_calculo x WHERE x.id_ramo = r.id)`);
      }

      // Archivos que quedaron sin documento ni foto que los use.
      const huerfanos = await tx.$queryRawUnsafe<{ almacen: string; clave: string }[]>(
        `DELETE FROM cys.archivos a WHERE a.empresa = ANY($1::text[])
            AND NOT EXISTS (SELECT 1 FROM cys.documentos d WHERE d.id_archivo = a.id)
            AND NOT EXISTS (SELECT 1 FROM cys.partes x WHERE x.id_foto = a.id)
            AND NOT EXISTS (SELECT 1 FROM cys.vehiculos x WHERE x.id_foto = a.id)
            AND NOT EXISTS (SELECT 1 FROM cys.propiedades x WHERE x.id_foto = a.id)
          RETURNING almacen, clave`,
        empresas,
      );
      if (huerfanos.length) detalle.push(`archivos: ${huerfanos.length}`);
      for (const empresa of empresas) {
        await registrarGestion(usuario, "BASE DE DATOS", `LIMPIEZA de ${grupos.map((g) => GRUPOS[g].titulo).join(", ")} · ${detalle.join(" · ") || "sin registros"}`, tx, {
          empresa, operacion: "LIMPIEZA", motivo,
        });
      }
      return huerfanos;
    },
    { timeout: 120_000 },
  );
  // El contenido se borra después de confirmar la transacción (si falla, quedan archivos sin registro, no al revés).
  await borrarContenidos(archivos);
  return detalle;
}
