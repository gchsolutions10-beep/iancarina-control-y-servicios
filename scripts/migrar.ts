/**
 * Aplica en orden las migraciones SQL de db/migraciones que aún no se hayan
 * ejecutado y las registra en cys.app_migraciones.
 *
 *   npm run db:migrar                 → aplica migraciones pendientes
 *   npm run db:migrar -- --semilla    → además carga db/semillas/demo.sql (SOLO demo)
 *
 * Funciona igual contra Neon (demo) o el PostgreSQL local de planta:
 * solo cambia DATABASE_URL. En Vercel corre en cada despliegue (script vercel-build), así
 * Preview migra la rama «pruebas» y Producción la rama «main» sin pasos manuales.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const DIR_MIGRACIONES = path.join(process.cwd(), "db", "migraciones");
const SEMILLA_DEMO = path.join(process.cwd(), "db", "semillas", "demo.sql");

async function main() {
  const url = (process.env.DATABASE_URL_MIGRACIONES || process.env.DATABASE_URL)?.trim();
  if (!url) throw new Error("Falta DATABASE_URL en el entorno (.env)");

  const client = new Client({ connectionString: url });
  await client.connect();

  // Candado por TRANSACCIÓN (pg_advisory_xact_lock), nunca de sesión: con la cadena «pooled»
  // de Neon (PgBouncer) un candado de sesión queda pegado en una conexión del pool y bloquea
  // para siempre las siguientes migraciones. Si otro proceso migra, se espera hasta 2 min.
  const conCandado = async <T>(trabajo: () => Promise<T>): Promise<T> => {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL lock_timeout = '120s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('cys:migraciones'))");
      const resultado = await trabajo();
      await client.query("COMMIT");
      return resultado;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof Error && /lock timeout/i.test(error.message)) {
        throw new Error("Otro proceso está migrando esta base (¿un despliegue de Vercel?). Espera a que termine y vuelve a intentar.");
      }
      throw error;
    }
  };

  try {
    await conCandado(() =>
      client.query(`
        CREATE SCHEMA IF NOT EXISTS cys;
        CREATE TABLE IF NOT EXISTS cys.app_migraciones (
          nombre      varchar(255) PRIMARY KEY,
          checksum    char(64)     NOT NULL,
          aplicada_en timestamptz  NOT NULL DEFAULT now()
        )`),
    );

    const archivos = (await readdir(DIR_MIGRACIONES))
      .filter((f) => /^\d{3}_.+\.sql$/.test(f) && !f.endsWith(".rollback.sql"))
      .sort();

    for (const archivo of archivos) {
      const sql = await readFile(path.join(DIR_MIGRACIONES, archivo), "utf8");
      // Mismo archivo con saltos de línea de Windows (CRLF) o Linux (LF) = misma migración.
      const lf = sql.replace(/\r\n/g, "\n");
      const sha = (texto: string) => createHash("sha256").update(texto).digest("hex");
      const checksum = sha(lf);

      // Se vuelve a leer dentro del candado: si otro proceso ya la aplicó, se salta.
      await conCandado(async () => {
        const { rows } = await client.query<{ checksum: string }>("SELECT checksum FROM cys.app_migraciones WHERE nombre = $1", [archivo]);
        const previo = rows[0]?.checksum;
        if (previo && [checksum, sha(sql), sha(lf.replace(/\n/g, "\r\n"))].includes(previo)) return;
        if (previo) {
          console.warn(`⚠  ${archivo} cambió después de aplicarse. No se reaplica; crea una migración nueva.`);
          return;
        }
        console.log(`→ Aplicando ${archivo}`);
        await client.query("SET LOCAL lock_timeout = 0");
        await client.query(sql);
        await client.query("INSERT INTO cys.app_migraciones (nombre, checksum) VALUES ($1, $2)", [archivo, checksum]);
      });
    }

    if (process.argv.includes("--semilla")) {
      console.log("→ Cargando datos de demostración");
      await client.query(await readFile(SEMILLA_DEMO, "utf8"));
    }

    console.log("✓ Base de datos al día");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("✗ Error en la migración:", error instanceof Error ? error.message : error);
  process.exit(1);
});
