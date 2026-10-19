import "server-only";
import Decimal from "decimal.js";
import { ajuste } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { estadoObligacion } from "@/lib/dominio/saldos";
import { importesVigentes } from "@/lib/dominio/siniestros";
import { diasEntre } from "@/lib/dominio/vigencias";
import { saldosDe } from "@/lib/finanzas/datos";
import { resumenPeriodo } from "@/lib/polizas/datos";
import { listarSiniestros } from "@/lib/siniestros/datos";
import { ultimosMeses } from "./tipos";

/**
 * Tablero gerencial (Reportes → Tablero). Todo por moneda: nunca se suman ni convierten monedas.
 * Prima neta = inicial + endosos confirmados de las vigencias en curso; saldos desde la vista.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
type PorMoneda = Record<string, Decimal>;
const sumar = (m: PorMoneda, moneda: string, v: Decimal.Value) => (m[moneda] = (m[moneda] ?? new Decimal(0)).plus(v));
const aTexto = (m: PorMoneda) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.toFixed(2)]));

export async function datosTablero(empresas: string[], sensibles: string[], hoy: string, monedaElegida: string) {
  const corte = new Date(`${hoy}T00:00:00Z`);
  const [diasPoliza, diasPrima] = await Promise.all([ajuste("polizas.dias_por_vencer"), ajuste("primas.dias_por_vencer")]);

  // ------------------------------------------------ vigencias en curso
  const periodos = await db.poliza_periodos.findMany({
    where: { empresa: { in: empresas }, estado: "confirmado", vigencia_desde: { lte: corte }, vigencia_hasta: { gt: corte } },
    orderBy: { vigencia_hasta: "asc" },
    include: { polizas: { select: { id: true, numero: true, partes: { select: { razon_social: true } }, ramos: { select: { nombre: true } } } } },
  });
  const resumenes = await Promise.all(periodos.map((p) => resumenPeriodo(p.id)));
  const prima: PorMoneda = {};
  const suma: PorMoneda = {};
  const porRamo = new Map<string, Decimal>();
  let asegurados = 0;
  periodos.forEach((p, i) => {
    sumar(prima, p.moneda, resumenes[i].primaTotal);
    sumar(suma, p.moneda, resumenes[i].sumaAsegurada);
    asegurados += resumenes[i].asegurados;
  });
  const monedas = [...new Set([...periodos.map((p) => p.moneda)])].sort();
  const moneda = monedas.includes(monedaElegida) ? monedaElegida : (monedas.find((m) => m === "USD") ?? monedas[0] ?? "");
  periodos.forEach((p, i) => {
    if (p.moneda !== moneda) return;
    const r = p.polizas.ramos.nombre;
    porRamo.set(r, (porRamo.get(r) ?? new Decimal(0)).plus(resumenes[i].primaTotal));
  });

  const porVencer = periodos
    .filter((p) => diasEntre(hoy, iso(p.vigencia_hasta)) <= diasPoliza)
    .map((p) => ({ id: Number(p.id), numero: p.polizas.numero, aseguradora: p.polizas.partes.razon_social ?? "", ramo: p.polizas.ramos.nombre, hasta: iso(p.vigencia_hasta), dias: diasEntre(hoy, iso(p.vigencia_hasta)) }));

  // ------------------------------------------------ saldos por pagar y por cobrar
  const obligaciones = await db.obligaciones.findMany({
    where: { empresa: { in: empresas }, estado: "vigente" },
    orderBy: { fecha_vencimiento: "asc" },
    include: { partes: { select: { razon_social: true } } },
  });
  const saldos = await saldosDe(obligaciones.map((o) => o.id));
  const porPagar: PorMoneda = {};
  const porPagarVencido: PorMoneda = {};
  const porCobrar: PorMoneda = {};
  const porCobrarVencido: PorMoneda = {};
  const primasProximas: { id: number; contraparte: string; vence: string; saldo: string; moneda: string; estado: string }[] = [];
  for (const o of obligaciones) {
    const s = saldos.get(o.id.toString());
    if (!s || new Decimal(s.saldo).lte(0)) continue;
    const vencida = iso(o.fecha_vencimiento) < hoy;
    if (o.naturaleza === "por_pagar") {
      sumar(porPagar, o.moneda, s.saldo);
      if (vencida) sumar(porPagarVencido, o.moneda, s.saldo);
      const estado = estadoObligacion({ estado: o.estado, saldo: s.saldo, vencimiento: iso(o.fecha_vencimiento) }, hoy, diasPrima);
      if (estado === "vencida" || estado === "por_vencer") primasProximas.push({ id: Number(o.id), contraparte: o.partes.razon_social ?? "", vence: iso(o.fecha_vencimiento), saldo: s.saldo, moneda: o.moneda, estado });
    } else {
      sumar(porCobrar, o.moneda, s.saldo);
      if (vencida) sumar(porCobrarVencido, o.moneda, s.saldo);
    }
  }

  // ------------------------------------------------ siniestros
  const meses = ultimosMeses(hoy, 12);
  const desde = new Date(`${meses[0]}-01T00:00:00Z`);
  const anio = hoy.slice(0, 4);
  const [{ conteo }, eventos, delAnio] = await Promise.all([
    listarSiniestros({ empresas, sensibles, q: "", estado: "", tipo: "", sujeto: "", pagina: 1 }),
    db.siniestros.findMany({ where: { empresa: { in: empresas }, estado: { not: "anulado" }, fecha_evento: { gte: desde } }, select: { fecha_evento: true } }),
    db.siniestros.findMany({
      where: { empresa: { in: empresas }, estado: { not: "anulado" }, fecha_evento: { gte: new Date(`${anio}-01-01T00:00:00Z`) } },
      select: { moneda: true, siniestro_importes: { select: { id: true, tipo: true, monto: true } } },
    }),
  ]);
  const porMes = new Map(meses.map((m) => [m, 0]));
  for (const e of eventos) {
    const m = iso(e.fecha_evento).slice(0, 7);
    if (porMes.has(m)) porMes.set(m, porMes.get(m)! + 1);
  }
  const reconocido: PorMoneda = {};
  for (const s of delAnio) {
    const r = importesVigentes(s.siniestro_importes.map((i) => ({ id: Number(i.id), tipo: i.tipo, monto: i.monto.toString() }))).reconocido;
    if (r) sumar(reconocido, s.moneda, r);
  }

  return {
    moneda,
    monedas,
    polizasVigentes: periodos.length,
    asegurados,
    prima: aTexto(prima),
    suma: aTexto(suma),
    porPagar: aTexto(porPagar),
    porPagarVencido: aTexto(porPagarVencido),
    porCobrar: aTexto(porCobrar),
    porCobrarVencido: aTexto(porCobrarVencido),
    reconocido: aTexto(reconocido),
    anio,
    siniestrosAbiertos: (conteo.abierto ?? 0) + (conteo.sin_movimiento ?? 0),
    sinMovimiento: conteo.sin_movimiento ?? 0,
    porCobrarSiniestros: conteo.por_cobrar ?? 0,
    primaPorRamo: [...porRamo.entries()].sort((a, b) => b[1].comparedTo(a[1])).map(([ramo, v]) => ({ ramo, prima: v.toFixed(2) })),
    siniestrosPorMes: meses.map((m) => ({ mes: m, n: porMes.get(m)! })),
    porVencer,
    diasPoliza,
    primasProximas: primasProximas.slice(0, 10),
    diasPrima,
  };
}
