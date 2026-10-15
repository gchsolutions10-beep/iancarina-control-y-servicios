import assert from "node:assert/strict";
import { test } from "node:test";
import Decimal from "decimal.js";
import { analizar, evaluar, validarExpresion, variablesDe } from "../lib/dominio/calculo/expresiones";
import { aplicarFormula, elegirRegla, prorratear, tasaPromedio, totalPrimas, variacion, type Regla } from "../lib/dominio/calculo/motor";
import { elegibleParaRenovar } from "../lib/dominio/elegibilidad";
import { estadoObligacion, imputacionesVigentes, montoObligacion, saldo, validarImputacion } from "../lib/dominio/saldos";
import { diasEntre, estadoVigencia, sumarAnios } from "../lib/dominio/vigencias";

const ev = (expr: string, entradas = {}) => evaluar(analizar(expr), entradas);
const valor = (expr: string, entradas = {}) => {
  const r = ev(expr, entradas);
  assert.ok(r.ok, JSON.stringify(r));
  return (r as { valor: Decimal }).valor.toString();
};

test("expresiones: aritmética decimal exacta y precedencia", () => {
  assert.equal(valor("0.1 + 0.2"), "0.3");
  assert.equal(valor("2 + 3 * 4"), "14");
  assert.equal(valor("(2 + 3) * 4"), "20");
  assert.equal(valor("-2 * 3"), "-6");
  assert.equal(valor("10 ÷ 4 × 2"), "5");
  assert.equal(valor("suma_asegurada * tasa / 100", { suma_asegurada: "25000", tasa: "2.5" }), "625");
});

test("expresiones: funciones y comparaciones", () => {
  assert.equal(valor("min(3, 1, 2)"), "1");
  assert.equal(valor("max(3, 1, 2)"), "3");
  assert.equal(valor("si(valor_bien > 1000, 1, 2)", { valor_bien: 5000 }), "1");
  assert.equal(valor("redondear(10 / 3, 2)"), "3.33");
  assert.equal(valor("redondear(2.345, 2)"), "2.35");
  // si() solo evalúa la rama que corresponde: no pide la tasa si no la usa.
  assert.equal(valor("si(prima_fija > 0, prima_fija, suma_asegurada * tasa / 100)", { prima_fija: 80 }), "80");
});

test("expresiones: faltantes en vez de inventar valores", () => {
  const r = ev("suma_asegurada * tasa / 100", { suma_asegurada: 1000 });
  assert.deepEqual(r, { ok: false, faltantes: ["tasa"] });
  const r2 = ev("valor_bien + aditamentos * tasa");
  assert.ok(!r2.ok && r2.faltantes?.length === 3);
  assert.deepEqual(ev("1 / (valor_bien - valor_bien)", { valor_bien: 5 }), { ok: false, error: "División entre cero" });
});

test("expresiones: rechaza lo que no es del lenguaje (sin eval)", () => {
  assert.match(validarExpresion("process.exit()") ?? "", /no permitido|desconocida/);
  assert.match(validarExpresion("tasa +") ?? "", /incompleta|termina/);
  assert.match(validarExpresion("foo * 2") ?? "", /Variable desconocida/);
  assert.match(validarExpresion("si(1, 2)") ?? "", /3 argumentos/);
  assert.equal(validarExpresion("valor_bien + aditamentos"), null);
  assert.deepEqual(variablesDe(analizar("suma_asegurada * tasa / 100 + tasa")), ["suma_asegurada", "tasa"]);
});

const regla = (r: Partial<Regla>): Regla => ({
  id: 1, nombre: "r", tipo: "prima", estado: "propuesta", version: 1, empresa: null, id_aseguradora: null, id_poliza: null, id_ramo: null,
  id_cobertura: null, expresion: "suma_asegurada * tasa / 100", evento: null, metodo: null, base_dias: null, decimales: 2,
  vigente_desde: "2000-01-01", vigente_hasta: null, ...r,
});
const ctx = { empresa: "a", id_aseguradora: 10, id_poliza: 100, id_ramo: 1, id_cobertura: 5, fecha: "2026-01-01" };

test("motor: gana la regla más específica y vigente; las retiradas no cuentan", () => {
  const general = regla({ id: 1 });
  const ramo = regla({ id: 2, id_ramo: 1 });
  const cobertura = regla({ id: 3, id_ramo: 1, id_cobertura: 5 });
  const aseguradora = regla({ id: 4, empresa: "a", id_aseguradora: 10, id_cobertura: 5 });
  const otraAseguradora = regla({ id: 5, empresa: "a", id_aseguradora: 11 });
  const retirada = regla({ id: 6, empresa: "a", id_poliza: 100, estado: "retirada" });
  const futura = regla({ id: 7, empresa: "a", id_poliza: 100, vigente_desde: "2027-01-01" });
  assert.equal(elegirRegla([general, ramo, cobertura, aseguradora, otraAseguradora, retirada, futura], "prima", ctx)?.id, 4);
  assert.equal(elegirRegla([general, ramo, cobertura], "prima", ctx)?.id, 3);
  assert.equal(elegirRegla([general, ramo], "prima", { ...ctx, id_ramo: 2 })?.id, 1);
  assert.equal(elegirRegla([general, regla({ id: 8, version: 2 })], "prima", ctx)?.id, 8);
  assert.equal(elegirRegla([], "prima", ctx), null);
});

test("motor: prima de casco = suma × tasa %, redondeo mitad hacia arriba; faltantes legibles", () => {
  const casco = regla({});
  assert.equal(aplicarFormula(casco, { suma_asegurada: "18333.33", tasa: "2.5" }).valor?.toFixed(2), "458.33");
  assert.equal(aplicarFormula(casco, { suma_asegurada: "100.1", tasa: "0.5" }).valor?.toFixed(2), "0.50");
  const sinTasa = aplicarFormula(casco, { suma_asegurada: 1000, tasa: null }, "Casco (clase Camión)");
  assert.equal(sinTasa.valor, null);
  assert.deepEqual(sinTasa.faltantes, ["tasa de Casco (clase Camión)"]);
  assert.deepEqual(aplicarFormula(null, {}).faltantes, ["No hay regla de cálculo aplicable"]);
});

test("motor: prorrata por días / 365 y método solo aseguradora", () => {
  const alta = regla({ tipo: "prorrateo", expresion: null, evento: "alta", metodo: "dias", base_dias: 365 });
  // Alta el 2026-07-01 en vigencia 2026-01-01 → 2027-01-01: 184 días.
  assert.equal(diasEntre("2026-07-01", "2027-01-01"), 184);
  assert.equal(prorratear(new Decimal(1000), 184, alta).valor?.toFixed(2), "504.11");
  assert.equal(prorratear(new Decimal(1000), 365, alta).valor?.toFixed(2), "1000.00");
  assert.equal(prorratear(new Decimal(1000), 10, null).faltante, "regla de prorrateo");
  assert.match(prorratear(new Decimal(1000), 10, regla({ tipo: "prorrateo", metodo: "solo_aseguradora", evento: "alta" })).faltante ?? "", /aseguradora/);
});

test("totales: lo incluido en otra cobertura no se suma dos veces; tasa ponderada y variación", () => {
  const total = totalPrimas([
    { cobertura: "Casco", incluidaEnPadre: false, prima: "625.00" },
    { cobertura: "RCV", incluidaEnPadre: false, prima: "120.50" },
    { cobertura: "Exceso (dentro de RCV)", incluidaEnPadre: true, prima: "30.00" },
    { cobertura: "Sin calcular", incluidaEnPadre: false, prima: null },
  ]);
  assert.equal(total.toFixed(2), "745.50");
  assert.equal(tasaPromedio(745.5, 25000)?.toString(), "2.982");
  assert.equal(tasaPromedio(10, 0), null);
  assert.equal(variacion(110, 100)?.toString(), "0.1");
  assert.equal(variacion(1, 0), null);
});

test("vigencias: aniversario, días y estado", () => {
  assert.equal(sumarAnios("2026-01-01"), "2027-01-01");
  assert.equal(sumarAnios("2024-02-29"), "2025-02-28");
  assert.equal(diasEntre("2026-01-01", "2027-01-01"), 365);
  assert.equal(diasEntre("2028-01-01", "2029-01-01"), 366);
  const p = { estado: "confirmado", desde: "2026-01-01", hasta: "2027-01-01" };
  assert.equal(estadoVigencia(p, "2025-12-31", 30), "futuro");
  assert.equal(estadoVigencia(p, "2026-06-01", 30), "vigente");
  assert.equal(estadoVigencia(p, "2026-12-15", 30), "por_vencer");
  assert.equal(estadoVigencia(p, "2027-01-01", 30), "vencido");
  assert.equal(estadoVigencia({ ...p, estado: "borrador" }, "2026-06-01", 30), "borrador");
});

test("elegibilidad: vendido antes del inicio sale de la renovación; después, sigue", () => {
  const veh = { tipo: "vehiculo" as const, nombre: "AB123CD", estado: "vendido", fecha_baja: "2026-12-15", motivo_baja: "venta" };
  const inc = { hasta: "2027-01-01", baja_por_endoso: false };
  const r = elegibleParaRenovar(inc, "2027-01-01", veh, "2027-01-01");
  assert.ok(!r.elegible && /Vendido el 2026-12-15/.test(r.motivo));
  assert.ok(elegibleParaRenovar(inc, "2027-01-01", { ...veh, fecha_baja: "2027-02-01" }, "2027-01-01").elegible);
  assert.ok(elegibleParaRenovar(inc, "2027-01-01", { ...veh, estado: "activo", fecha_baja: null, motivo_baja: null }, "2027-01-01").elegible);
  assert.ok(!elegibleParaRenovar({ hasta: "2026-08-01", baja_por_endoso: true }, "2027-01-01", { ...veh, estado: "activo", fecha_baja: null }, "2027-01-01").elegible);
  assert.ok(!elegibleParaRenovar(inc, "2027-01-01", { tipo: "persona", nombre: "ANA", estado: "inactiva", fecha_baja: null, motivo_baja: null }, "2027-01-01").elegible);
});

test("saldos: pagos parciales, reversiones y monedas", () => {
  const movs = [{ tipo: "cargo" as const, monto: "1000.00" }, { tipo: "disminucion" as const, monto: "100.00" }];
  assert.equal(montoObligacion(movs).toFixed(2), "900.00");
  const imps = [
    { id: 1, monto: "300.00", revierte_a: null },
    { id: 2, monto: "200.00", revierte_a: null },
    { id: 3, monto: "200.00", revierte_a: 2 }, // pago anulado
  ];
  assert.deepEqual(imputacionesVigentes(imps).map((i) => i.id), [1]);
  assert.equal(saldo(movs, imps).toFixed(2), "600.00");
  assert.equal(estadoObligacion({ estado: "vigente", saldo: 600, vencimiento: "2026-01-10" }, "2026-01-11", 15), "vencida");
  assert.equal(estadoObligacion({ estado: "vigente", saldo: 600, vencimiento: "2026-01-20" }, "2026-01-11", 15), "por_vencer");
  assert.equal(estadoObligacion({ estado: "vigente", saldo: 0, vencimiento: "2026-01-01" }, "2026-01-11", 15), "pagada");
  assert.match(validarImputacion({ monto: 10, moneda: "VES" }, { saldo: 600, moneda: "USD" }) ?? "", /no convierte/);
  assert.match(validarImputacion({ monto: 601, moneda: "USD" }, { saldo: 600, moneda: "USD" }) ?? "", /supera/);
  assert.equal(validarImputacion({ monto: 600, moneda: "USD" }, { saldo: 600, moneda: "USD" }), null);
});

test("formato de importes desde el texto decimal exacto", async () => {
  const { formatearImporte, formatearTasa } = await import("../lib/formato");
  assert.equal(formatearImporte("1234567.5"), "1.234.567,50");
  assert.equal(formatearImporte("-504.11", "USD"), "−504,11 USD");
  assert.equal(formatearImporte(null), "—");
  assert.equal(formatearTasa("2.50000000"), "2,5");
  assert.equal(formatearTasa("3.00000000"), "3");
});
