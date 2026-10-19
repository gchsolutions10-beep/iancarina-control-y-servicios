/**
 * Siniestros contra una base PostgreSQL NUEVA (migraciones desde cero). Necesita DATABASE_URL_PRUEBAS
 * con «prueba» en el nombre de la base. Uso: npm run test:bd
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
let s: string, veh: string, aseg: string, persona: string;

before(async () => {
  if (omitir) return;
  await c.connect();
  await c.query("DROP SCHEMA IF EXISTS cys CASCADE");
  execFileSync(process.execPath, ["--import", "tsx", "scripts/migrar.ts"], { env: { ...process.env, DATABASE_URL: url, DATABASE_URL_MIGRACIONES: "" }, stdio: "pipe" });
  await c.query("BEGIN");
  await c.query("INSERT INTO cys.app_empresas (codigo, nombre) VALUES ('a', 'Empresa A'), ('b', 'Empresa B')");
  await c.query("INSERT INTO cys.app_usuarios (id_usuario, nombre_usuario, nombre_apellido) VALUES (900, 'prueba', 'PRUEBA')");
  aseg = (await uno("INSERT INTO cys.partes (empresa, tipo, tipo_identificacion, numero_identificacion, razon_social, funciones, creado_por) VALUES ('a','juridica','J','1','ASEG','{Aseguradora}',900) RETURNING id")).id;
  persona = (await uno("INSERT INTO cys.partes (empresa, tipo, tipo_identificacion, numero_identificacion, nombres, apellidos, creado_por) VALUES ('a','natural','V','2','ANA','P',900) RETURNING id")).id;
  veh = (await uno("INSERT INTO cys.vehiculos (empresa, origen, placa, creado_por) VALUES ('a','propio','SIN001',900) RETURNING id")).id;
  s = (await uno(`INSERT INTO cys.siniestros (empresa, numero_expediente, id_tipo, id_flujo, fecha_evento, fecha_notificacion, descripcion, moneda, creado_por)
                  SELECT 'a', 'SIN-2026-0001', t.id, t.id_flujo, '2026-03-01', '2026-03-02', 'Choque', 'USD', 900 FROM cys.tipos_siniestro t WHERE t.nombre LIKE 'Choque%' RETURNING id`)).id;
});

after(async () => {
  if (omitir) return;
  await c.query("ROLLBACK");
  await c.end();
});

test("flujo de vehículos del requerimiento cargado con sus cinco etapas", saltar, async () => {
  const { rows } = await c.query("SELECT e.nombre FROM cys.flujo_etapas e JOIN cys.flujos f ON f.id = e.id_flujo WHERE f.nombre = 'Vehículos propios' ORDER BY e.orden");
  assert.deepEqual(rows.map((r) => r.nombre), ["Notificación", "Orden de reparación", "Entrada a taller", "Entrega", "Reembolso"]);
});

test("expediente único por empresa; notificación no anterior al evento; cierre coherente", saltar, async () => {
  const base = "SELECT 'a', 'SIN-2026-0001', t.id, t.id_flujo, '2026-03-01', '2026-03-02', 'x', 'USD', 900 FROM cys.tipos_siniestro t LIMIT 1";
  await falla(`INSERT INTO cys.siniestros (empresa, numero_expediente, id_tipo, id_flujo, fecha_evento, fecha_notificacion, descripcion, moneda, creado_por) ${base}`, "23505");
  await c.query(`INSERT INTO cys.siniestros (empresa, numero_expediente, id_tipo, id_flujo, fecha_evento, fecha_notificacion, descripcion, moneda, creado_por) ${base.replace("'a'", "'b'")}`);
  await falla(`UPDATE cys.siniestros SET fecha_notificacion = '2026-02-01' WHERE id = ${s}`, "23514");
  await falla(`UPDATE cys.siniestros SET estado = 'cerrado' WHERE id = ${s}`, "23514");
});

test("afectados: a lo sumo un sujeto, de la misma empresa; cobertura solo con póliza vinculada", saltar, async () => {
  await c.query(`INSERT INTO cys.siniestro_afectados (empresa, id_siniestro, id_vehiculo, creado_por) VALUES ('a', ${s}, ${veh}, 900)`);
  await falla(`INSERT INTO cys.siniestro_afectados (empresa, id_siniestro, id_vehiculo, id_persona, creado_por) VALUES ('a', ${s}, ${veh}, ${persona}, 900)`, "23514");
  await falla(`INSERT INTO cys.siniestro_afectados (empresa, id_siniestro, id_cobertura, creado_por) SELECT 'a', ${s}, id, 900 FROM cys.coberturas LIMIT 1`, "23514");
  await falla(`INSERT INTO cys.siniestro_afectados (empresa, id_siniestro, id_vehiculo, creado_por) VALUES ('b', ${s}, ${veh}, 900)`, "23503");
});

test("una sola etapa abierta; importes y actuaciones no se editan ni se borran", saltar, async () => {
  const etapa = (await uno("SELECT e.id FROM cys.flujo_etapas e JOIN cys.flujos f ON f.id = e.id_flujo WHERE f.nombre = 'Vehículos propios' AND e.orden = 1")).id;
  await c.query(`INSERT INTO cys.siniestro_etapas (empresa, id_siniestro, id_etapa, fecha_inicio, creado_por) VALUES ('a', ${s}, ${etapa}, '2026-03-02', 900)`);
  await falla(`INSERT INTO cys.siniestro_etapas (empresa, id_siniestro, id_etapa, fecha_inicio, creado_por) VALUES ('a', ${s}, ${etapa}, '2026-03-03', 900)`, "23505");
  await c.query(`INSERT INTO cys.siniestro_importes (empresa, id_siniestro, tipo, monto, fecha, creado_por) VALUES ('a', ${s}, 'presupuestado', 1500, '2026-03-05', 900)`);
  const imp = (await uno(`INSERT INTO cys.siniestro_importes (empresa, id_siniestro, tipo, monto, fecha, creado_por) VALUES ('a', ${s}, 'reconocido', 1000, '2026-03-10', 900) RETURNING id`)).id;
  await c.query(`INSERT INTO cys.siniestro_importes (empresa, id_siniestro, tipo, monto, fecha, creado_por) VALUES ('a', ${s}, 'reconocido', 1200, '2026-03-12', 900)`);
  await falla(`UPDATE cys.siniestro_importes SET monto = 1 WHERE id = ${imp}`, "P0001");
  await falla(`DELETE FROM cys.siniestro_importes WHERE id = ${imp}`, "P0001");
  const vigente = await uno(`SELECT monto::text FROM cys.vw_siniestro_importes WHERE id_siniestro = ${s} AND tipo = 'reconocido'`);
  assert.equal(vigente.monto, "1200.00");
});

test("reembolso por cobrar ligado al expediente; cobrar no depende de cerrar (reconocido ≠ cobrado)", saltar, async () => {
  await falla(`INSERT INTO cys.obligaciones (empresa, naturaleza, concepto, id_contraparte, moneda, fecha_emision, fecha_vencimiento, descripcion, creado_por) VALUES ('a','por_cobrar','reembolso_siniestro',${aseg},'USD','2026-03-12','2026-04-12','x',900)`, "23514");
  const o = (await uno(`INSERT INTO cys.obligaciones (empresa, naturaleza, concepto, id_contraparte, id_siniestro, moneda, fecha_emision, fecha_vencimiento, descripcion, creado_por) VALUES ('a','por_cobrar','reembolso_siniestro',${aseg},${s},'USD','2026-03-12','2026-04-12','Reembolso',900) RETURNING id`)).id;
  await c.query(`INSERT INTO cys.obligacion_movimientos (empresa, id_obligacion, tipo, monto, fecha, creado_por) VALUES ('a', ${o}, 'cargo', 1200, '2026-03-12', 900)`);
  await c.query(`UPDATE cys.siniestros SET estado = 'cerrado', cerrado_en = '2026-03-20' WHERE id = ${s}`);
  assert.equal((await uno(`SELECT saldo::text FROM cys.vw_saldos_obligaciones WHERE id = ${o}`)).saldo, "1200.00");
  const egreso = (await uno(`INSERT INTO cys.pagos (empresa, sentido, fecha, monto, moneda, id_contraparte, creado_por) VALUES ('a','egreso','2026-03-25',100,'USD',${aseg},900) RETURNING id`)).id;
  await falla(`INSERT INTO cys.imputaciones (empresa, id_pago, id_obligacion, monto, fecha, creado_por) VALUES ('a', ${egreso}, ${o}, 100, '2026-03-25', 900)`, "23514", /ingreso/);
  const ingreso = (await uno(`INSERT INTO cys.pagos (empresa, sentido, fecha, monto, moneda, id_contraparte, creado_por) VALUES ('a','ingreso','2026-03-25',500,'USD',${aseg},900) RETURNING id`)).id;
  await c.query(`INSERT INTO cys.imputaciones (empresa, id_pago, id_obligacion, monto, fecha, creado_por) VALUES ('a', ${ingreso}, ${o}, 500, '2026-03-25', 900)`);
  assert.equal((await uno(`SELECT saldo::text FROM cys.vw_saldos_obligaciones WHERE id = ${o}`)).saldo, "700.00");
});
