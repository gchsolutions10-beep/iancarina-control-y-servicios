/**
 * Pólizas, endosos y finanzas contra una base PostgreSQL NUEVA (migraciones desde cero).
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

let aseguradora: string, persona: string, vehiculo: string, periodo: string, inclusion: string;

before(async () => {
  if (omitir) return;
  await c.connect();
  await c.query("DROP SCHEMA IF EXISTS cys CASCADE");
  execFileSync(process.execPath, ["--import", "tsx", "scripts/migrar.ts"], { env: { ...process.env, DATABASE_URL: url, DATABASE_URL_MIGRACIONES: "" }, stdio: "pipe" });
  await c.query("BEGIN");
  await c.query("INSERT INTO cys.app_empresas (codigo, nombre) VALUES ('a', 'Empresa A'), ('b', 'Empresa B')");
  await c.query("INSERT INTO cys.app_usuarios (id_usuario, nombre_usuario, nombre_apellido) VALUES (900, 'prueba', 'PRUEBA')");
  aseguradora = (await uno("INSERT INTO cys.partes (empresa, tipo, tipo_identificacion, numero_identificacion, razon_social, funciones, creado_por) VALUES ('a','juridica','J','1','ASEGURADORA', '{Aseguradora}', 900) RETURNING id")).id;
  persona = (await uno("INSERT INTO cys.partes (empresa, tipo, tipo_identificacion, numero_identificacion, nombres, apellidos, creado_por) VALUES ('a','natural','V','2','ANA','PRUEBA',900) RETURNING id")).id;
  vehiculo = (await uno("INSERT INTO cys.vehiculos (empresa, origen, placa, creado_por) VALUES ('a','propio','AA111AA',900) RETURNING id")).id;
  const poliza = (await uno(`INSERT INTO cys.polizas (empresa, id_aseguradora, numero, id_ramo, creado_por) SELECT 'a', ${aseguradora}, 'P-1', id, 900 FROM cys.ramos WHERE nombre = 'Automóvil (flota)' RETURNING id`)).id;
  periodo = (await uno(`INSERT INTO cys.poliza_periodos (empresa, id_poliza, numero_periodo, vigencia_desde, vigencia_hasta, moneda, creado_por) VALUES ('a', ${poliza}, 1, '2026-01-01', '2027-01-01', 'USD', 900) RETURNING id`)).id;
  inclusion = (await uno(`INSERT INTO cys.inclusiones (empresa, id_periodo, id_vehiculo, desde, hasta, creado_por) VALUES ('a', ${periodo}, ${vehiculo}, '2026-01-01', '2027-01-01', 900) RETURNING id`)).id;
});

after(async () => {
  if (omitir) return;
  await c.query("ROLLBACK");
  await c.end();
});

test("la propuesta base queda cargada como reglas «propuesta», sin importes", saltar, async () => {
  const { rows } = await c.query("SELECT nombre, estado, expresion FROM cys.reglas_calculo ORDER BY id");
  assert.ok(rows.length >= 9);
  assert.ok(rows.every((r) => r.estado === "propuesta"));
  assert.ok(rows.every((r) => r.expresion === null || !/\d{2,}/.test(r.expresion.replace("100", ""))), "ninguna fórmula trae tasas o importes fijos");
});

test("un asegurado: exactamente un sujeto, sin repetirse en el período y dentro de la vigencia", saltar, async () => {
  await falla(`INSERT INTO cys.inclusiones (empresa, id_periodo, id_vehiculo, id_persona, desde, hasta, creado_por) VALUES ('a', ${periodo}, ${vehiculo}, ${persona}, '2026-01-01', '2027-01-01', 900)`, "23514");
  await falla(`INSERT INTO cys.inclusiones (empresa, id_periodo, id_vehiculo, desde, hasta, creado_por) VALUES ('a', ${periodo}, ${vehiculo}, '2026-06-01', '2027-01-01', 900)`, "23P01");
  await falla(`INSERT INTO cys.inclusiones (empresa, id_periodo, id_persona, desde, hasta, creado_por) VALUES ('a', ${periodo}, ${persona}, '2025-12-01', '2027-01-01', 900)`, "23514", /dentro de la vigencia/);
});

test("las vigencias de una póliza no se solapan y no se mezclan empresas", saltar, async () => {
  const poliza = (await uno(`SELECT id_poliza FROM cys.poliza_periodos WHERE id = ${periodo}`)).id_poliza;
  await falla(`INSERT INTO cys.poliza_periodos (empresa, id_poliza, numero_periodo, vigencia_desde, vigencia_hasta, moneda, creado_por) VALUES ('a', ${poliza}, 2, '2026-12-01', '2027-12-01', 'USD', 900)`, "23P01");
  await falla(`INSERT INTO cys.polizas (empresa, id_aseguradora, numero, id_ramo, creado_por) VALUES ('b', ${aseguradora}, 'X', 1, 900)`, "23503");
  await falla(`INSERT INTO cys.polizas (empresa, id_aseguradora, numero, id_ramo, creado_por) VALUES ('a', ${aseguradora}, 'p 1', 1, 900)`, "23505");
});

test("un período confirmado no se edita: las altas, bajas y tarifas exigen endoso", saltar, async () => {
  const cob = (await uno("SELECT id FROM cys.coberturas WHERE nombre = 'RCV'")).id;
  await c.query(`INSERT INTO cys.periodo_tarifas (empresa, id_periodo, id_cobertura, prima_fija, creado_por) VALUES ('a', ${periodo}, ${cob}, 100, 900)`);
  const calc = (await uno(`INSERT INTO cys.calculos (empresa, tipo, resultado, creado_por) VALUES ('a', 'prima', 100, 900) RETURNING id`)).id;
  await c.query(`INSERT INTO cys.inclusion_coberturas (empresa, id_inclusion, id_cobertura, prima_anual, prima_periodo, origen, id_calculo, creado_por) VALUES ('a', ${inclusion}, ${cob}, 100, 100, 'calculada', ${calc}, 900)`);
  await c.query(`UPDATE cys.poliza_periodos SET estado = 'confirmado', confirmado_por = 900, confirmado_en = now() WHERE id = ${periodo}`);

  await falla(`UPDATE cys.poliza_periodos SET vigencia_hasta = '2027-02-01' WHERE id = ${periodo}`, "P0001", /endoso/);
  await falla(`UPDATE cys.poliza_periodos SET estado = 'borrador' WHERE id = ${periodo}`, "P0001");
  await falla(`DELETE FROM cys.poliza_periodos WHERE id = ${periodo}`, "P0001");
  await falla(`UPDATE cys.inclusion_coberturas SET prima_anual = 1, prima_periodo = 1 WHERE id_inclusion = ${inclusion}`, "P0001");
  await falla(`DELETE FROM cys.inclusiones WHERE id = ${inclusion}`, "P0001");
  await falla(`UPDATE cys.inclusiones SET suma_asegurada = 1 WHERE id = ${inclusion}`, "P0001");
  await falla(`UPDATE cys.periodo_tarifas SET prima_fija = 1 WHERE id_periodo = ${periodo}`, "P0001");
  await falla(`INSERT INTO cys.inclusiones (empresa, id_periodo, id_persona, desde, hasta, creado_por) VALUES ('a', ${periodo}, ${persona}, '2026-06-01', '2027-01-01', 900)`, "P0001", /endoso/);

  // Con endoso: baja que solo cierra la inclusión, y alta con su endoso.
  const baja = (await uno(`INSERT INTO cys.endosos (empresa, id_periodo, numero, tipo, fecha_efectiva, prima, descripcion, creado_por) VALUES ('a', ${periodo}, 1, 'baja', '2026-07-01', -50, 'Baja', 900) RETURNING id`)).id;
  await c.query(`UPDATE cys.inclusiones SET hasta = '2026-07-01', id_endoso_baja = ${baja} WHERE id = ${inclusion}`);
  await falla(`UPDATE cys.inclusiones SET hasta = '2026-08-01' WHERE id = ${inclusion}`, "P0001");
  const alta = (await uno(`INSERT INTO cys.endosos (empresa, id_periodo, numero, tipo, fecha_efectiva, prima, descripcion, creado_por) VALUES ('a', ${periodo}, 2, 'alta', '2026-06-01', 30, 'Alta', 900) RETURNING id`)).id;
  await c.query(`INSERT INTO cys.inclusiones (empresa, id_periodo, id_persona, desde, hasta, id_endoso_alta, creado_por) VALUES ('a', ${periodo}, ${persona}, '2026-06-01', '2027-01-01', ${alta}, 900)`);
  await falla(`INSERT INTO cys.endosos (empresa, id_periodo, numero, tipo, fecha_efectiva, descripcion, creado_por) VALUES ('a', ${periodo}, 2, 'alta', '2026-06-01', 'x', 900)`, "23505");
});

test("pagos parciales: saldo desde movimientos e imputaciones; nada se borra ni se convierte", saltar, async () => {
  const o = (await uno(`INSERT INTO cys.obligaciones (empresa, naturaleza, concepto, id_contraparte, id_periodo, moneda, fecha_emision, fecha_vencimiento, descripcion, creado_por) VALUES ('a', 'por_pagar', 'prima', ${aseguradora}, ${periodo}, 'USD', '2026-01-01', '2026-01-31', 'Prima', 900) RETURNING id`)).id;
  await c.query(`INSERT INTO cys.obligacion_movimientos (empresa, id_obligacion, tipo, monto, fecha, creado_por) VALUES ('a', ${o}, 'cargo', 1000, '2026-01-01', 900)`);
  await falla(`INSERT INTO cys.obligaciones (empresa, naturaleza, concepto, id_contraparte, id_periodo, moneda, fecha_emision, fecha_vencimiento, descripcion, creado_por) VALUES ('a', 'por_pagar', 'prima', ${aseguradora}, ${periodo}, 'USD', '2026-01-01', '2026-01-31', 'Otra', 900)`, "23505");

  const pago = async (monto: number, moneda = "USD") =>
    (await uno(`INSERT INTO cys.pagos (empresa, sentido, fecha, monto, moneda, id_contraparte, creado_por) VALUES ('a', 'egreso', '2026-01-10', ${monto}, '${moneda}', ${aseguradora}, 900) RETURNING id`)).id;
  const imputar = (p: string, monto: number) => `INSERT INTO cys.imputaciones (empresa, id_pago, id_obligacion, monto, fecha, creado_por) VALUES ('a', ${p}, ${o}, ${monto}, '2026-01-10', 900)`;
  const saldo = async () => (await uno(`SELECT saldo::text FROM cys.vw_saldos_obligaciones WHERE id = ${o}`)).saldo;

  const p1 = await pago(400);
  const i1 = (await uno(imputar(p1, 400) + " RETURNING id")).id;
  assert.equal(await saldo(), "600.00");
  const p2 = await pago(700);
  await falla(imputar(p2, 700), "23514", /saldo/);
  await falla(imputar(await pago(10, "VES"), 10), "23514", /moneda/);
  await falla(imputar(p1, 1), "23514", /disponible del pago/);
  await falla(`UPDATE cys.imputaciones SET monto = 1 WHERE id = ${i1}`, "P0001");
  await falla(`DELETE FROM cys.pagos WHERE id = ${p1}`, "P0001");
  await falla(`UPDATE cys.pagos SET monto = 1 WHERE id = ${p1}`, "P0001");

  // Anular: primero se revierte la imputación, luego el pago queda anulado.
  await falla(`UPDATE cys.pagos SET estado = 'anulado', anulado_por = 900, anulado_en = now(), motivo_anulacion = 'x' WHERE id = ${p1}`, "23514", /revierten/);
  await c.query(`INSERT INTO cys.imputaciones (empresa, id_pago, id_obligacion, monto, fecha, revierte_a, creado_por) VALUES ('a', ${p1}, ${o}, 400, '2026-01-11', ${i1}, 900)`);
  await c.query(`UPDATE cys.pagos SET estado = 'anulado', anulado_por = 900, anulado_en = now(), motivo_anulacion = 'x' WHERE id = ${p1}`);
  assert.equal(await saldo(), "1000.00");
  await c.query(imputar(p2, 700));
  assert.equal(await saldo(), "300.00");
});

test("las reglas no se editan (versiones) y la bitácora sigue inmutable", saltar, async () => {
  await falla("UPDATE cys.reglas_calculo SET expresion = 'tasa' WHERE nombre = 'Prima de casco'", "P0001", /versión nueva/);
  await c.query("UPDATE cys.reglas_calculo SET estado = 'aprobada' WHERE nombre = 'Prima de casco'");
  await falla("DELETE FROM cys.reglas_calculo WHERE nombre = 'Prima de casco'", "P0001");
});
