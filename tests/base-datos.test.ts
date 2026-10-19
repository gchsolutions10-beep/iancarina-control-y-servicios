import assert from "node:assert/strict";
import { test } from "node:test";
import { pasosDe, resolverGrupos } from "../lib/base-datos/grupos";

test("limpiar un grupo arrastra lo que depende de él, en orden de llaves", () => {
  assert.deepEqual(resolverGrupos(["finanzas"]), ["finanzas"]);
  assert.deepEqual(resolverGrupos(["siniestros"]), ["finanzas", "siniestros"]);
  assert.deepEqual(resolverGrupos(["polizas"]), ["finanzas", "siniestros", "polizas"]);
  assert.deepEqual(resolverGrupos(["personas"]), ["finanzas", "siniestros", "polizas", "activos", "personas"]);
  assert.deepEqual(resolverGrupos(["activos", "x"]), ["finanzas", "siniestros", "polizas", "activos"]);
  assert.deepEqual(resolverGrupos([]), []);
});

test("los pasos borran primero lo que referencia y nunca tocan la bitácora ni la configuración", () => {
  const tablas = pasosDe(resolverGrupos(["personas"])).map((p) => p.tabla);
  assert.ok(tablas.indexOf("imputaciones") < tablas.indexOf("obligaciones"));
  assert.ok(tablas.indexOf("obligaciones") < tablas.indexOf("poliza_periodos"));
  assert.ok(tablas.indexOf("inclusiones") < tablas.indexOf("vehiculos"));
  assert.ok(tablas.indexOf("siniestro_afectados") < tablas.indexOf("inclusiones"));
  assert.ok(tablas.indexOf("siniestros") < tablas.indexOf("poliza_periodos"));
  assert.ok(tablas.indexOf("polizas") < tablas.indexOf("partes"));
  for (const t of ["app_bitacora", "app_usuarios", "app_empresas", "ramos", "coberturas", "marcas"]) assert.ok(!tablas.includes(t), t);
});
