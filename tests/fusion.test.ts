import assert from "node:assert/strict";
import { test } from "node:test";
import { camposACompletar, COLUMNAS_PARTE, mensajeErrorFusion, ordenarPar, REFERENCIAS_PARTE, soloDigitos } from "../lib/dominio/fusion";

test("un par siempre con el menor número primero", () => {
  assert.deepEqual(ordenarPar(9, 3), [3, 9]);
  assert.deepEqual(ordenarPar(3, 9), [3, 9]);
});

test("la identificación se compara solo por sus dígitos", () => {
  assert.equal(soloDigitos("V-12.345.678"), soloDigitos("E12345678"));
});

test("el destino solo toma del origen los datos que le faltan", () => {
  assert.deepEqual(camposACompletar({ telefono: "0414", correo: null, direccion: "" }, { telefono: "0412", correo: "a@b.c", direccion: "Calle 1", fecha_nacimiento: null }), ["correo", "direccion"]);
});

test("cada tabla que referencia una parte tiene su etiqueta y su columna", () => {
  assert.deepEqual(Object.keys(COLUMNAS_PARTE).sort(), Object.keys(REFERENCIAS_PARTE).sort());
  assert.equal(Object.keys(COLUMNAS_PARTE).length, 11);
});

test("los errores de la base se explican en palabras simples", () => {
  assert.match(mensajeErrorFusion("23P01"), /misma póliza/);
  assert.match(mensajeErrorFusion(null), /Intente de nuevo/);
});
