/**
 * Instalación y actualización en el servidor de la empresa (docs/INSTALACION-SERVIDOR.md).
 *
 *   npm run instalar      → revisa el .env, la base y la carpeta de archivos; aplica las migraciones
 *                           pendientes y crea el primer administrador (ADMIN_INICIAL_*).
 *   npm run verificar     → solo revisa, no cambia nada (útil antes de llamar a soporte).
 *
 * Cada problema se explica en palabras simples con lo que hay que corregir. Nunca carga datos de
 * ejemplo: en el servidor de la empresa la base empieza en blanco.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { administradorInicial } from "./lib/administrador-inicial";

const soloVerificar = process.argv.includes("--verificar");
const v = (n: string) => process.env[n]?.trim() || "";
let errores = 0;
const ok = (t: string) => console.log(`  ✓ ${t}`);
const aviso = (t: string) => console.log(`  ⚠ ${t}`);
const error = (t: string) => {
  errores++;
  console.log(`  ✗ ${t}`);
};
const titulo = (t: string) => console.log(`\n${t}`);

function revisarEntorno() {
  titulo("1. Programas y archivo .env");
  const [mayor, menor] = process.versions.node.split(".").map(Number);
  if (mayor > 20 || (mayor === 20 && menor >= 9)) ok(`Node.js ${process.versions.node}`);
  else error(`Node.js ${process.versions.node} es muy antiguo: instale Node.js 22 LTS desde https://nodejs.org`);

  if (existsSync(path.join(process.cwd(), ".env"))) ok("Archivo .env encontrado");
  else aviso("No hay archivo .env en esta carpeta: copie .env.servidor.example como .env y complételo (o defina las variables en el sistema)");

  if (!v("DATABASE_URL")) error("Falta DATABASE_URL: la dirección de la base PostgreSQL (postgresql://usuario:clave@servidor:5432/base)");
  else ok("DATABASE_URL definida");

  const secreto = v("SESSION_SECRET");
  if (secreto.length < 32) error("SESSION_SECRET falta o es corto (mínimo 32 caracteres). Genere uno con: npm run secreto");
  else if (/cambia-esto|pega-aqui/i.test(secreto)) error("SESSION_SECRET todavía tiene el texto de ejemplo. Genere uno con: npm run secreto");
  else ok("SESSION_SECRET definido");

  if (v("PREPARAR_DEMO") === "true") error("PREPARAR_DEMO=true es solo para la demo de Vercel. En el servidor de la empresa debe ser false");
  else ok("Sin datos de ejemplo (PREPARAR_DEMO no está activo)");

  if (v("SESSION_COOKIE_SECURE") === "true") aviso("SESSION_COOKIE_SECURE=true: el sistema solo funcionará si se entra por https://. Sin certificado, póngalo en false");
  else ok("SESSION_COOKIE_SECURE=false (entrada por http:// dentro de la red)");

  ok(`Zona horaria: ${v("ZONA_HORARIA") || "America/Caracas (por defecto)"}`);
}

async function revisarCarpeta() {
  titulo("2. Carpeta de documentos y fotos");
  const ruta = v("ARCHIVOS_RUTA_BASE");
  if (v("ALMACEN") !== "carpeta" || !ruta) {
    if (v("BLOB_STORE_ID") || v("BLOB_READ_WRITE_TOKEN")) return ok("Los archivos se guardan en Vercel Blob");
    return aviso("Sin carpeta de archivos: el sistema funciona, pero no podrá subir documentos ni fotos. Defina ALMACEN=carpeta y ARCHIVOS_RUTA_BASE");
  }
  if (!path.isAbsolute(ruta)) return error(`ARCHIVOS_RUTA_BASE debe ser una ruta completa (ej. D:\\SegurosArchivos o /srv/seguros-archivos), no «${ruta}»`);
  try {
    await mkdir(ruta, { recursive: true });
    const prueba = path.join(ruta, `.prueba-escritura-${process.pid}`);
    await writeFile(prueba, "ok");
    await rm(prueba);
    ok(`Carpeta ${ruta} con permiso de escritura`);
  } catch (e) {
    error(`No se puede escribir en ${ruta}: ${e instanceof Error ? e.message : e}. Dé permiso de lectura y escritura al usuario que ejecuta el sistema`);
  }
}

async function revisarBase(encabezado = "3. Base de datos"): Promise<Client | null> {
  titulo(encabezado);
  const url = v("DATABASE_URL_MIGRACIONES") || v("DATABASE_URL");
  if (!url) return null;
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/password authentication failed/i.test(m)) error("La clave o el usuario de la base no son correctos (revise DATABASE_URL)");
    else if (/does not exist/i.test(m)) error(`La base no existe: ${m}. Créela en pgAdmin (paso 3 de la guía)`);
    else if (/ECONNREFUSED|timeout|ENOTFOUND/i.test(m)) error(`No se llega al servidor PostgreSQL (${m}). ¿Está encendido? ¿El host y el puerto 5432 son correctos? ¿El firewall lo permite?`);
    else error(`No se pudo conectar: ${m}`);
    return null;
  }
  const { rows } = await client.query<{ version: string; usuario: string; base: string; zona: string }>(
    "SELECT split_part(version(), ' ', 2) AS version, current_user AS usuario, current_database() AS base, current_setting('TimeZone') AS zona",
  );
  const r = rows[0];
  ok(`Conectado a «${r.base}» como «${r.usuario}» (PostgreSQL ${r.version})`);
  if (Number(r.version.split(".")[0]) < 14) error(`PostgreSQL ${r.version} es muy antiguo: se necesita la versión 14 o superior (recomendada 16)`);
  return client;
}

async function estadoBase(client: Client) {
  const { rows } = await client.query<{ hay: boolean }>("SELECT to_regclass('cys.app_migraciones') IS NOT NULL AS hay");
  if (!rows[0].hay) return aviso("La base está vacía: todavía no se instalaron las tablas");
  const aplicadas = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM cys.app_migraciones");
  const archivos = readdirSync(path.join(process.cwd(), "db", "migraciones")).filter((f) => /^\d{3}_.+\.sql$/.test(f) && !f.endsWith(".rollback.sql"));
  const pendientes = archivos.length - aplicadas.rows[0].n;
  if (pendientes > 0) aviso(`Hay ${pendientes} actualización(es) de la base pendiente(s): ejecute npm run instalar`);
  else ok(`Tablas al día (${aplicadas.rows[0].n} migraciones aplicadas)`);
  const admins = await client.query<{ n: number }>(
    `SELECT count(DISTINCT u.id_usuario)::int AS n FROM cys.app_usuarios u
     JOIN cys.app_usuario_roles ur ON ur.id_usuario = u.id_usuario JOIN cys.app_roles r ON r.id = ur.id_rol
     WHERE r.codigo = 'administrador' AND NOT u.bloqueado`,
  );
  if (admins.rows[0].n === 0) error("No hay ningún administrador: defina ADMIN_INICIAL_USUARIO y ADMIN_INICIAL_CLAVE en el .env y ejecute npm run instalar");
  else ok(`${admins.rows[0].n} administrador(es) activo(s)`);
}

async function main() {
  console.log(soloVerificar ? "Verificando la instalación (no se cambia nada)…" : "Instalando o actualizando el sistema…");
  revisarEntorno();
  await revisarCarpeta();
  const client = await revisarBase();

  if (client && !soloVerificar && errores === 0) {
    titulo("4. Tablas y primer administrador");
    await client.end();
    execFileSync(process.execPath, [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), "scripts/migrar.ts"], { stdio: "inherit" });
    await administradorInicial();
    const otra = await revisarBase("5. Comprobación final");
    if (otra) {
      await estadoBase(otra);
      await otra.end();
    }
  } else if (client) {
    await estadoBase(client);
    await client.end();
  }

  console.log("");
  if (errores > 0) {
    console.log(`✗ Hay ${errores} problema(s). Corríjalos en el archivo .env (o en el servidor) y vuelva a ejecutar este comando.`);
    process.exit(1);
  }
  console.log(soloVerificar ? "✓ Todo en orden." : "✓ Listo. Siguiente paso: npm run build y luego npm start (o pm2, ver la guía).");
}

main().catch((e: unknown) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
