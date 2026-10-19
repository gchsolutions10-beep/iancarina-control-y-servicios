/**
 * Pruebas contra una base PostgreSQL NUEVA: aplica todas las migraciones desde cero y verifica las
 * restricciones de integridad. Necesita DATABASE_URL_PRUEBAS apuntando a una base desechable cuyo
 * nombre contenga «prueba» (se borra el esquema cys). Uso: npm run test:bd
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";
import { Client } from "pg";

const url = process.env.DATABASE_URL_PRUEBAS;
const omitir = !url || !/prueba/i.test(new URL(url).pathname);
const c = new Client({ connectionString: url });

const falla = async (sql: string, codigo: string) => {
  await c.query("SAVEPOINT p");
  try {
    await c.query(sql);
    assert.fail(`Debió fallar con ${codigo}: ${sql}`);
  } catch (e) {
    assert.equal((e as { code?: string }).code, codigo, (e as Error).message);
  } finally {
    await c.query("ROLLBACK TO SAVEPOINT p");
  }
};

before(async () => {
  if (omitir) return;
  await c.connect();
  await c.query("DROP SCHEMA IF EXISTS cys CASCADE");
  execFileSync(process.execPath, ["--import", "tsx", "scripts/migrar.ts"], { env: { ...process.env, DATABASE_URL: url, DATABASE_URL_MIGRACIONES: "" }, stdio: "pipe" });
  await c.query("BEGIN");
  await c.query("INSERT INTO cys.app_empresas (codigo, nombre) VALUES ('a', 'Empresa A'), ('b', 'Empresa B')");
  await c.query("INSERT INTO cys.app_usuarios (id_usuario, nombre_usuario, nombre_apellido) VALUES (900, 'prueba', 'PRUEBA')");
});

after(async () => {
  if (omitir) return;
  await c.query("ROLLBACK");
  await c.end();
});

const parte = async (empresa: string, ident: string, nombre = "ANA") =>
  (await c.query(`INSERT INTO cys.partes (empresa, tipo, tipo_identificacion, numero_identificacion, nombres, apellidos, creado_por) VALUES ($1, 'natural', 'V', $2, $3, 'PRUEBA', 900) RETURNING id`, [empresa, ident, nombre])).rows[0].id;

test("las migraciones se aplican sobre una base nueva", { skip: omitir && "sin DATABASE_URL_PRUEBAS" }, async () => {
  const { rows } = await c.query("SELECT count(*)::int AS n FROM cys.app_migraciones");
  assert.ok(rows[0].n >= 2);
});

test("una persona = una ficha por empresa; la misma identificación puede existir en otra empresa", { skip: omitir && "sin DATABASE_URL_PRUEBAS" }, async () => {
  await parte("a", "1.111.111");
  await falla("INSERT INTO cys.partes (empresa, tipo, tipo_identificacion, numero_identificacion, nombres, apellidos, creado_por) VALUES ('a','natural','V','1111111','X','Y',900)", "23505");
  await parte("b", "1111111");
});

test("la base impide relacionar registros de dos empresas", { skip: omitir && "sin DATABASE_URL_PRUEBAS" }, async () => {
  const deA = await parte("a", "2222222");
  const v = (await c.query("INSERT INTO cys.vehiculos (empresa, origen, placa, creado_por) VALUES ('b', 'propio', 'AB123CD', 900) RETURNING id")).rows[0].id;
  await falla(`INSERT INTO cys.titularidades (empresa, id_vehiculo, rol, id_parte, desde, creado_por) VALUES ('b', ${v}, 'propietario_legal', ${deA}, '2025-01-01', 900)`, "23503");
});

test("las titularidades no se solapan en el tiempo; documentos van a una sola ficha", { skip: omitir && "sin DATABASE_URL_PRUEBAS" }, async () => {
  const p = await parte("a", "3333333");
  const v = (await c.query("INSERT INTO cys.vehiculos (empresa, origen, placa, creado_por) VALUES ('a', 'propio', 'XY999ZZ', 900) RETURNING id")).rows[0].id;
  await c.query(`INSERT INTO cys.titularidades (empresa, id_vehiculo, rol, id_parte, desde, hasta, creado_por) VALUES ('a', ${v}, 'propietario_legal', ${p}, '2024-01-01', '2024-12-31', 900)`);
  await falla(`INSERT INTO cys.titularidades (empresa, id_vehiculo, rol, id_parte, desde, creado_por) VALUES ('a', ${v}, 'propietario_legal', ${p}, '2024-06-01', 900)`, "23P01");
  await c.query(`INSERT INTO cys.titularidades (empresa, id_vehiculo, rol, id_parte, desde, creado_por) VALUES ('a', ${v}, 'propietario_legal', ${p}, '2025-01-01', 900)`);
  await c.query(`INSERT INTO cys.archivos (id, empresa, almacen, clave, nombre, tipo_mime, tamano, sha256, es_imagen, subido_por) VALUES ('00000000-0000-0000-0000-000000000001', 'a', 'carpeta', 'a/x.pdf', 'x.pdf', 'application/pdf', 10, repeat('0', 64), false, 900)`);
  await falla(`INSERT INTO cys.documentos (empresa, id_archivo, tipo_documento, id_parte, id_vehiculo, creado_por) VALUES ('a', '00000000-0000-0000-0000-000000000001', 'Otro', ${p}, ${v}, 900)`, "23514");
});

test("un vehículo vendido libera la placa y conserva su historial", { skip: omitir && "sin DATABASE_URL_PRUEBAS" }, async () => {
  await c.query("INSERT INTO cys.vehiculos (empresa, origen, placa, creado_por) VALUES ('a', 'propio', 'VEN-001', 900)");
  await falla("INSERT INTO cys.vehiculos (empresa, origen, placa, creado_por) VALUES ('a', 'propio', 'VEN001', 900)", "23505");
  await c.query("UPDATE cys.vehiculos SET estado = 'vendido', fecha_baja = '2026-01-15', motivo_baja = 'venta' WHERE placa = 'VEN-001'");
  await c.query("INSERT INTO cys.vehiculos (empresa, origen, placa, creado_por) VALUES ('a', 'propio', 'VEN001', 900)");
  await falla("UPDATE cys.vehiculos SET estado = 'vendido' WHERE placa = 'VEN001'", "23514");
});

test("la bitácora no se puede modificar ni borrar", { skip: omitir && "sin DATABASE_URL_PRUEBAS" }, async () => {
  await c.query("INSERT INTO cys.app_bitacora (fecha_gestion, modulo, descripcion) VALUES (now(), 'PRUEBA', 'x')");
  await falla("UPDATE cys.app_bitacora SET descripcion = 'y'", "P0001");
  await falla("DELETE FROM cys.app_bitacora", "P0001");
});

test("TM es la capacidad en toneladas métricas: número entre 0 y 200", { skip: omitir && "sin DATABASE_URL_PRUEBAS" }, async () => {
  await c.query("INSERT INTO cys.vehiculos (empresa, origen, placa, tm, creado_por) VALUES ('a', 'propio', 'TM18T01', 18, 900)");
  await falla("INSERT INTO cys.vehiculos (empresa, origen, placa, tm, creado_por) VALUES ('a', 'propio', 'TM999', 500, 900)", "23514");
  await falla("INSERT INTO cys.vehiculos (empresa, origen, placa, tm, creado_por) VALUES ('a', 'propio', 'TMXX', 'treinta', 900)", "22P02");
});
