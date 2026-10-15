/**
 * Crea (o actualiza) la cuenta técnica de soporte de GCH Solutions: administrador web
 * con el rol «desarrollador» (que un administrador no puede asignar desde la web).
 * También sirve para crear el primer administrador en una base nueva.
 *
 *   DATABASE_URL="…" npm run usuario:soporte -- <usuario> <clave>
 *
 * - Si el usuario no existe, se crea con nombre «SOPORTE GCH SOLUTIONS».
 * - Para retirarla al terminar el proyecto: cys.app_usuarios.bloqueado = true.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Client } from "pg";

async function main() {
  // La clave puede llegar por CLAVE_SOPORTE para que no quede visible en la línea de comandos.
  const [nombreUsuario, claveArgumento] = process.argv.slice(2);
  const clave = process.env.CLAVE_SOPORTE || claveArgumento;
  if (!nombreUsuario || !clave) throw new Error("Uso: npm run usuario:soporte -- <usuario> <clave>  (o CLAVE_SOPORTE=<clave>)");
  if (clave.length < 10) throw new Error("Usa una clave de al menos 10 caracteres");

  const client = new Client({ connectionString: process.env.DATABASE_URL?.trim() });
  await client.connect();
  try {
    await client.query("BEGIN");
    const hash = await bcrypt.hash(clave, 12);
    const { rows } = await client.query<{ id_usuario: number }>(
      `INSERT INTO cys.app_usuarios (nombre_usuario, nombre_apellido, cargo, clave_hash, clave_actualizada)
       VALUES ($1, 'SOPORTE GCH SOLUTIONS', 'SOPORTE', $2, now())
       ON CONFLICT ((lower(nombre_usuario))) DO UPDATE
         SET clave_hash = EXCLUDED.clave_hash, clave_actualizada = now(), bloqueado = false,
             intentos_fallidos = 0, bloqueado_hasta = NULL, debe_cambiar_clave = false, actualizado_en = now()
       RETURNING id_usuario`,
      [nombreUsuario, hash],
    );
    const id = rows[0].id_usuario;
    await client.query(
      `INSERT INTO cys.app_usuario_roles (id_usuario, id_rol)
       SELECT $1, id FROM cys.app_roles WHERE codigo IN ('administrador', 'desarrollador')
       ON CONFLICT DO NOTHING`,
      [id],
    );
    await client.query("COMMIT");
    console.log(`✓ Cuenta de soporte «${nombreUsuario}» lista (administrador, id ${id}).`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("✗", error instanceof Error ? error.message : error);
  process.exit(1);
});
