/**
 * Fusión de personas duplicadas (migración 007) contra una base PostgreSQL NUEVA.
 * Necesita DATABASE_URL_PRUEBAS con «prueba» en el nombre de la base. Uso: npm run test:bd
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";
import { Client } from "pg";

const url = process.env.DATABASE_URL_PRUEBAS;
const omitir = !url || !/prueba/i.test(new URL(url).pathname);
const c = new Client({ connectionString: url });
const saltar = { skip: omitir && "sin DATABASE_URL_PRUEBAS" };

const falla = async (sql: string, codigo: string, mensaje?: RegExp) => {
  await c.query("SAVEPOINT p");
  try {
    await c.query(sql);
    assert.fail(`Debió fallar con ${codigo}: ${sql}`);
  } catch (e) {
    assert.equal((e as { code?: string }).code, codigo, (e as Error).message);
    if (mensaje) assert.match((e as Error).message, mensaje);
  } finally {
    await c.query("ROLLBACK TO SAVEPOINT p");
  }
};
const uno = async (sql: string) => (await c.query(sql)).rows[0];
const parte = (tipo_id: string, num: string, nombre: string, extra = "") =>
  uno(`INSERT INTO cys.partes (empresa, tipo, tipo_identificacion, numero_identificacion, nombres, apellidos, creado_por${extra ? ", telefono, direccion" : ""})
       VALUES ('a','natural','${tipo_id}','${num}','${nombre}','PRUEBA',900${extra}) RETURNING id`).then((r) => r.id as string);

let aseguradora: string, original: string, duplicada: string, periodo: string, incDup: string, pago: string;

before(async () => {
  if (omitir) return;
  await c.connect();
  await c.query("DROP SCHEMA IF EXISTS cys CASCADE");
  execFileSync(process.execPath, ["--import", "tsx", "scripts/migrar.ts"], { env: { ...process.env, DATABASE_URL: url, DATABASE_URL_MIGRACIONES: "" }, stdio: "pipe" });
  await c.query("BEGIN");
  await c.query("INSERT INTO cys.app_empresas (codigo, nombre) VALUES ('a', 'Empresa A')");
  await c.query("INSERT INTO cys.app_usuarios (id_usuario, nombre_usuario, nombre_apellido) VALUES (900, 'prueba', 'PRUEBA')");
  aseguradora = (await uno("INSERT INTO cys.partes (empresa, tipo, tipo_identificacion, numero_identificacion, razon_social, funciones, creado_por) VALUES ('a','juridica','J','1','ASEGURADORA','{Aseguradora}',900) RETURNING id")).id;
  original = await parte("V", "123", "ANA");
  duplicada = await parte("E", "123", "ANNA", ", '0414-1', 'CALLE 1'");
  const poliza = (await uno(`INSERT INTO cys.polizas (empresa, id_aseguradora, numero, id_ramo, creado_por) SELECT 'a', ${aseguradora}, 'P-1', id, 900 FROM cys.ramos WHERE nombre = 'Automóvil (flota)' RETURNING id`)).id;
  periodo = (await uno(`INSERT INTO cys.poliza_periodos (empresa, id_poliza, numero_periodo, vigencia_desde, vigencia_hasta, moneda, creado_por) VALUES ('a', ${poliza}, 1, '2026-01-01', '2027-01-01', 'USD', 900) RETURNING id`)).id;
  incDup = (await uno(`INSERT INTO cys.inclusiones (empresa, id_periodo, id_persona, desde, hasta, creado_por) VALUES ('a', ${periodo}, ${duplicada}, '2026-01-01', '2027-01-01', 900) RETURNING id`)).id;
  await c.query(`UPDATE cys.poliza_periodos SET estado = 'confirmado', confirmado_por = 900, confirmado_en = now() WHERE id = ${periodo}`);
  pago = (await uno(`INSERT INTO cys.pagos (empresa, sentido, fecha, monto, moneda, id_contraparte, creado_por) VALUES ('a', 'egreso', '2026-02-01', 10, 'USD', ${duplicada}, 900) RETURNING id`)).id;
});

after(async () => {
  if (omitir) return;
  await c.query("ROLLBACK");
  await c.end();
});

test("los disparadores siguen bloqueando cambios fuera de una fusión", saltar, async () => {
  await falla(`UPDATE cys.inclusiones SET id_persona = ${original} WHERE id = ${incDup}`, "P0001", /endoso/);
  await falla(`UPDATE cys.pagos SET id_contraparte = ${original} WHERE id = ${pago}`, "P0001");
  // La variable de la fusión no permite cambiar otra cosa que la llave de la parte.
  await c.query("SAVEPOINT v");
  await c.query("SELECT set_config('cys.fusion', 'on', true)");
  await falla(`UPDATE cys.pagos SET monto = 99 WHERE id = ${pago}`, "P0001");
  await c.query("ROLLBACK TO SAVEPOINT v");
});

test("no se fusionan tipos distintos ni una ficha consigo misma", saltar, async () => {
  await falla(`SELECT cys.fusionar_partes('a', ${aseguradora}, ${original}, 'motivo de prueba', 900)`, "23514", /mismo tipo/);
  await falla(`SELECT cys.fusionar_partes('a', ${original}, ${original}, 'motivo de prueba', 900)`, "23514");
});

test("fusionar mueve todo (incluso de períodos confirmados y pagos), completa datos y se revierte", saltar, async () => {
  const id = (await uno(`SELECT cys.fusionar_partes('a', ${duplicada}, ${original}, 'misma persona', 900) AS id`)).id;
  assert.equal((await uno(`SELECT id_persona FROM cys.inclusiones WHERE id = ${incDup}`)).id_persona, original);
  assert.equal((await uno(`SELECT id_contraparte FROM cys.pagos WHERE id = ${pago}`)).id_contraparte, original);
  const d = await uno(`SELECT telefono, direccion FROM cys.partes WHERE id = ${original}`);
  assert.deepEqual(d, { telefono: "0414-1", direccion: "CALLE 1" });
  const o = await uno(`SELECT estado, fusionada_en FROM cys.partes WHERE id = ${duplicada}`);
  assert.deepEqual(o, { estado: "fusionada", fusionada_en: original });
  // La identificación de la fusionada queda libre (índice único parcial) y la duplicada no se vuelve a fusionar.
  await falla(`SELECT cys.fusionar_partes('a', ${duplicada}, ${original}, 'otra vez', 900)`, "23514", /fusionada/);
  // El registro no se edita ni se borra.
  await falla(`UPDATE cys.fusiones_personas SET motivo = 'otro' WHERE id = ${id}`, "P0001");
  await falla(`DELETE FROM cys.fusiones_personas WHERE id = ${id}`, "P0001");

  await c.query(`SELECT cys.revertir_fusion('a', ${id}, 'era otra persona', 900)`);
  assert.equal((await uno(`SELECT id_persona FROM cys.inclusiones WHERE id = ${incDup}`)).id_persona, duplicada);
  assert.equal((await uno(`SELECT id_contraparte FROM cys.pagos WHERE id = ${pago}`)).id_contraparte, duplicada);
  assert.deepEqual(await uno(`SELECT telefono, direccion FROM cys.partes WHERE id = ${original}`), { telefono: null, direccion: null });
  assert.deepEqual(await uno(`SELECT estado, fusionada_en FROM cys.partes WHERE id = ${duplicada}`), { estado: "activa", fusionada_en: null });
  await falla(`SELECT cys.revertir_fusion('a', ${id}, 'de nuevo', 900)`, "23514", /ya se revirtió/);
});

test("no se fusionan dos asegurados de la misma póliza con fechas que se cruzan", saltar, async () => {
  const otra = await parte("V", "777", "BETO");
  await c.query("SAVEPOINT x");
  try {
    const per2 = (await uno(`INSERT INTO cys.poliza_periodos (empresa, id_poliza, numero_periodo, vigencia_desde, vigencia_hasta, moneda, creado_por) SELECT 'a', id_poliza, 2, '2027-01-01', '2028-01-01', 'USD', 900 FROM cys.poliza_periodos WHERE id = ${periodo} RETURNING id`)).id;
    await c.query(`INSERT INTO cys.inclusiones (empresa, id_periodo, id_persona, desde, hasta, creado_por) VALUES ('a', ${per2}, ${otra}, '2027-01-01', '2028-01-01', 900), ('a', ${per2}, ${original}, '2027-01-01', '2028-01-01', 900)`);
    await falla(`SELECT cys.fusionar_partes('a', ${otra}, ${original}, 'cruce de fechas', 900)`, "23P01");
  } finally {
    await c.query("ROLLBACK TO SAVEPOINT x");
  }
});
