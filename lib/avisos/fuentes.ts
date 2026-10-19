import "server-only";
import Decimal from "decimal.js";
import { ajuste } from "@/lib/ajustes";
import type { UsuarioActual } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { diasEntre } from "@/lib/dominio/vigencias";
import { empresasDe } from "@/lib/fichas/acceso";
import { saldosDe } from "@/lib/finanzas/datos";
import { formatearImporte } from "@/lib/formato";
import { listarSiniestros } from "@/lib/siniestros/datos";
import { hoyPlanta } from "@/lib/tiempo";
import { enVentana, gravedad, ordenarAvisos, type Aviso } from "./reglas";

/**
 * Avisos de la campana, limitados a las empresas que el usuario ve: pólizas por vencer o vencidas sin
 * renovar, primas por pagar vencidas o por vencer, cobros vencidos y expedientes sin movimiento.
 * Se calculan al pedirlos (no se guardan): desaparecen solos al renovar, pagar, cobrar o actuar.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const cuando = (fecha: string, hoy: string) => {
  const d = diasEntre(hoy, fecha);
  return d === 0 ? "hoy" : d > 0 ? `en ${d} ${d === 1 ? "día" : "días"}` : `hace ${-d} ${d === -1 ? "día" : "días"}`;
};

export async function avisosDe(usuario: UsuarioActual): Promise<Aviso[]> {
  const empresas = empresasDe(usuario, "seguros.ver");
  if (empresas.length === 0) return [];
  const hoy = hoyPlanta();
  const [diasPoliza, diasPrima] = await Promise.all([ajuste("polizas.dias_por_vencer"), ajuste("primas.dias_por_vencer")]);
  const desde = new Date(`${hoy}T00:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - diasPoliza);
  const hasta = new Date(`${hoy}T00:00:00Z`);
  hasta.setUTCDate(hasta.getUTCDate() + Math.max(diasPoliza, diasPrima));

  const [periodos, obligaciones, siniestros] = await Promise.all([
    db.poliza_periodos.findMany({
      where: {
        empresa: { in: empresas },
        estado: "confirmado",
        vigencia_hasta: { gte: desde, lte: hasta },
        polizas: { estado: "activa" },
        other_poliza_periodos: { none: { estado: { not: "anulado" } } },
      },
      include: { polizas: { select: { numero: true, partes: { select: { razon_social: true } }, ramos: { select: { nombre: true } } } } },
    }),
    db.obligaciones.findMany({
      where: { empresa: { in: empresas }, estado: "vigente", fecha_vencimiento: { lte: hasta } },
      include: { partes: { select: { razon_social: true } } },
    }),
    listarSiniestros({ empresas, sensibles: empresasDe(usuario, "personas.datos_sensibles"), q: "", estado: "sin_movimiento", tipo: "", sujeto: "", pagina: 1 }),
  ]);

  const avisos: Aviso[] = [];
  for (const p of periodos) {
    const fecha = iso(p.vigencia_hasta);
    if (!enVentana(fecha, hoy, diasPoliza)) continue;
    const g = gravedad(fecha, hoy);
    avisos.push({
      id: `poliza-${p.id}`,
      tipo: "poliza",
      gravedad: g,
      titulo: `${g === "vencido" ? "Póliza vencida sin renovar" : "Póliza por vencer"}: ${p.polizas.numero}`,
      detalle: `${p.polizas.ramos.nombre} · ${p.polizas.partes.razon_social ?? ""} · vence ${cuando(fecha, hoy)}`,
      fecha,
      enlace: `/polizas/periodos/${p.id}`,
      empresa: p.empresa,
    });
  }

  const saldos = await saldosDe(obligaciones.map((o) => o.id));
  for (const o of obligaciones) {
    const s = saldos.get(o.id.toString());
    if (!s || new Decimal(s.saldo).lte(0)) continue;
    const fecha = iso(o.fecha_vencimiento);
    const g = gravedad(fecha, hoy);
    const pagar = o.naturaleza === "por_pagar";
    // Por pagar: vencidas y las que vencen dentro del plazo. Por cobrar: solo las vencidas.
    if (g === "proximo" && (!pagar || diasEntre(hoy, fecha) > diasPrima)) continue;
    avisos.push({
      id: `obligacion-${o.id}`,
      tipo: pagar ? "prima" : "cobro",
      gravedad: g,
      titulo: pagar ? `${g === "vencido" ? "Prima vencida" : "Prima por vencer"}: ${o.partes.razon_social ?? ""}` : `Cobro vencido: ${o.partes.razon_social ?? ""}`,
      detalle: `Saldo ${formatearImporte(s.saldo, o.moneda)} · vence ${cuando(fecha, hoy)}`,
      fecha,
      enlace: `/finanzas/primas/${o.id}`,
      empresa: o.empresa,
    });
  }

  for (const s of siniestros.filas) {
    avisos.push({
      id: `siniestro-${s.id}`,
      tipo: "siniestro",
      gravedad: "vencido",
      titulo: `Expediente sin movimiento: ${s.numero}`,
      detalle: `${s.tipo} · ${s.afectado} · etapa ${s.etapa}`,
      fecha: s.fecha,
      enlace: `/siniestros/${s.id}`,
      empresa: s.empresa,
    });
  }
  return ordenarAvisos(avisos);
}
