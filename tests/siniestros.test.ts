import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consumoLimite,
  documentosFaltantes,
  estadoControl,
  evaluarNuevoImporte,
  importesVigentes,
  numeroExpediente,
  siguienteConsecutivo,
  siguienteEtapa,
} from "../lib/dominio/siniestros";

test("expedientes SIN-AAAA-NNNN: consecutivo por año", () => {
  assert.equal(numeroExpediente(2026, 7), "SIN-2026-0007");
  assert.equal(siguienteConsecutivo(2026, ["SIN-2026-0001", "SIN-2026-0012", "SIN-2025-0099", "OTRO"]), 13);
  assert.equal(siguienteConsecutivo(2027, ["SIN-2026-0012"]), 1);
});

test("importe vigente = último de cada tipo; el resto es historial", () => {
  const v = importesVigentes([
    { id: 1, tipo: "presupuestado", monto: "1000" },
    { id: 3, tipo: "presupuestado", monto: "1200" },
    { id: 2, tipo: "autorizado", monto: "900" },
  ]);
  assert.equal(v.presupuestado?.toString(), "1200");
  assert.equal(v.autorizado?.toString(), "900");
  assert.equal(v.reconocido, undefined);
});

test("límites: aviso desde 80 %, bloqueo al pasar el 100 %, con el cálculo del disponible", () => {
  const c = consumoLimite(60000, ["20000", "30000"], 80);
  assert.equal(c.disponible.toString(), "10000");
  assert.equal(c.porcentaje.toString(), "83.33");
  assert.equal(c.estado, "aviso");
  assert.equal(consumoLimite(60000, ["10000"], 80).estado, "ok");
  assert.equal(consumoLimite(60000, ["60000.01"], 80).estado, "excedido");

  const lim = { descripcion: "Agregado anual", monto: 60000, moneda: "USD" };
  // El expediente ya consumía 5.000; se reemplaza por 12.000 (no se suma).
  const ok = evaluarNuevoImporte(lim, 50000, 5000, 12000, 80);
  assert.equal(ok.permitido, true);
  assert.match(ok.aviso ?? "", /disponible 15000.00/);
  const no = evaluarNuevoImporte(lim, 50000, 5000, 16000, 80);
  assert.equal(no.permitido, false);
  assert.match(no.aviso ?? "", /Supera el límite/);
  assert.deepEqual(evaluarNuevoImporte(lim, 0, 0, 1000, 80), { permitido: true, aviso: null });
});

test("etapas en orden y documentos que faltan", () => {
  const etapas = [{ id: 10, orden: 2 }, { id: 9, orden: 1 }, { id: 11, orden: 3 }];
  assert.equal(siguienteEtapa(etapas, null)?.id, 9);
  assert.equal(siguienteEtapa(etapas, 9)?.id, 10);
  assert.equal(siguienteEtapa(etapas, 11), null);
  assert.deepEqual(documentosFaltantes(["Presupuesto", "Orden de reparación"], ["presupuesto", "Fotografía"]), ["Orden de reparación"]);
});

test("control: sin movimiento y cerrado con saldo por cobrar (reconocido ≠ cobrado)", () => {
  assert.equal(estadoControl({ estado: "abierto", ultimaActividad: "2026-01-01", saldoPorCobrar: 0 }, "2026-01-20", 15), "sin_movimiento");
  assert.equal(estadoControl({ estado: "abierto", ultimaActividad: "2026-01-10", saldoPorCobrar: 0 }, "2026-01-20", 15), "abierto");
  assert.equal(estadoControl({ estado: "cerrado", ultimaActividad: "2026-01-10", saldoPorCobrar: "150.00" }, "2026-01-20", 15), "por_cobrar");
  assert.equal(estadoControl({ estado: "cerrado", ultimaActividad: "2026-01-10", saldoPorCobrar: 0 }, "2026-01-20", 15), "cerrado");
});
