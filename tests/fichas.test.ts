import assert from "node:assert/strict";
import { test } from "node:test";
import { detectarTipo, nombreSeguro } from "../lib/archivos/tipos";
import { cierreTitularidad, enmascarar, nombreParte, normalizarCodigo, parteSchema, propiedadSchema, relacionSchema, vehiculoSchema } from "../lib/validations/fichas";

const base = { tipo_identificacion: "V", numero_identificacion: "12.345.678", nombres: "ANA", apellidos: "PÉREZ", razon_social: "", funciones: [], fecha_nacimiento: "", telefono: "", correo: "", direccion: "", observaciones: "" };

test("persona natural exige nombres y apellidos; jurídica exige razón social y limpia lo que no aplica", () => {
  assert.ok(parteSchema.safeParse({ ...base, tipo: "natural" }).success);
  assert.ok(!parteSchema.safeParse({ ...base, tipo: "natural", apellidos: "" }).success);
  const j = parteSchema.safeParse({ ...base, tipo: "juridica", tipo_identificacion: "J", razon_social: "SEGUROS DEMO, C.A.", funciones: ["Aseguradora"], fecha_nacimiento: "2000-01-01" });
  assert.ok(j.success);
  if (j.success) {
    assert.equal(j.data.nombres, null);
    assert.equal(j.data.fecha_nacimiento, null);
    assert.equal(nombreParte(j.data), "SEGUROS DEMO, C.A.");
  }
  assert.ok(!parteSchema.safeParse({ ...base, tipo: "juridica" }).success);
  assert.ok(!parteSchema.safeParse({ ...base, tipo: "natural", correo: "no-es-correo" }).success);
});

test("la identificación se normaliza igual que en la base (sin puntos ni guiones)", () => {
  assert.equal(normalizarCodigo("V-12.345.678"), "V12345678");
  assert.equal(normalizarCodigo("ab 12-c"), "AB12C");
});

test("sin permiso, los datos personales se enmascaran", () => {
  const p = { nombre: "ANA", telefono: "0414", correo: null, direccion: "Caracas", fecha_nacimiento: "1990-01-01" };
  assert.deepEqual(enmascarar(p, false), { nombre: "ANA", telefono: "•••", correo: null, direccion: "•••", fecha_nacimiento: "•••" });
  assert.deepEqual(enmascarar(p, true), p);
});

test("el nuevo titular cierra al anterior el día previo y no puede empezar antes", () => {
  assert.deepEqual(cierreTitularidad("2024-01-10", "2026-03-01"), { ok: true, hasta: "2026-02-28" });
  assert.equal(cierreTitularidad("2024-01-10", "2024-01-10").ok, false);
});

test("relación: el fin no puede ser anterior al inicio; vehículo y propiedad validan sus campos", () => {
  assert.ok(!relacionSchema.safeParse({ tipo_relacion: "Socio", porcentaje: "", desde: "2025-01-01", hasta: "2024-12-31", observaciones: "" }).success);
  assert.ok(relacionSchema.safeParse({ tipo_relacion: "Socio", porcentaje: "33,5", desde: "2025-01-01", hasta: "", observaciones: "" }).success);
  const v = { origen: "propio", placa: "ab123cd", id_modelo: "", anio: "2020", tm: "", color: "", tipo_vehiculo: "", clasificacion_chuto: "", tiene_batea: false, fecha_adquisicion: "", observaciones: "" };
  const r = vehiculoSchema.safeParse(v);
  assert.ok(r.success && r.data.placa === "AB123CD");
  assert.ok(!vehiculoSchema.safeParse({ ...v, anio: "1800" }).success);
  assert.ok(!propiedadSchema.safeParse({ nombre: "Galpón", tipo_inmueble: "", direccion: "", valor_declarado: "1000", moneda: "", observaciones: "" }).success, "valor sin moneda");
});

test("el tipo de archivo se detecta por el contenido, no por la extensión", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  assert.equal(detectarTipo(pdf, "x.jpg"), "pdf");
  assert.equal(detectarTipo(png, "foto.png"), "png");
  assert.equal(detectarTipo(exe, "factura.pdf"), null);
  assert.equal(detectarTipo(zip, "hoja.xlsx"), "xlsx");
  assert.equal(detectarTipo(zip, "algo.zip"), null);
  assert.equal(nombreSeguro("C:\\x\\..\\informe<1>.pdf"), "informe1.pdf");
});
