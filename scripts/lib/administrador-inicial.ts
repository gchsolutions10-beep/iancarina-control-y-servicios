/**
 * Primer administrador (Vercel y servidor de la empresa): si ADMIN_INICIAL_USUARIO y
 * ADMIN_INICIAL_CLAVE están definidas y ese usuario no existe, lo crea (administrador + desarrollador).
 * Si ya existe no lo toca: un cambio de clave hecho desde la web no se pierde al actualizar.
 */
import bcrypt from "bcryptjs";
import { Client } from "pg";

export async function administradorInicial() {
  const usuario = process.env.ADMIN_INICIAL_USUARIO?.trim();
  const clave = process.env.ADMIN_INICIAL_CLAVE?.trim();
  if (!usuario || !clave) return;
  if (clave.length < 10) throw new Error("ADMIN_INICIAL_CLAVE debe tener al menos 10 caracteres");

  const client = new Client({ connectionString: (process.env.DATABASE_URL_MIGRACIONES || process.env.DATABASE_URL)?.trim() });
  await client.connect();
  try {
    const existe = await client.query("SELECT 1 FROM cys.app_usuarios WHERE lower(nombre_usuario) = lower($1)", [usuario]);
    if (existe.rowCount) {
      console.log(`· El administrador inicial «${usuario}» ya existe: no se modifica`);
      return;
    }
    await client.query("BEGIN");
    const { rows } = await client.query<{ id_usuario: number }>(
      `INSERT INTO cys.app_usuarios (nombre_usuario, nombre_apellido, cargo, clave_hash, clave_actualizada, recibe_alertas, recibe_aprobaciones)
       VALUES ($1, 'ADMINISTRADOR', 'ADMINISTRADOR DEL SISTEMA', $2, now(), true, true) RETURNING id_usuario`,
      [usuario, await bcrypt.hash(clave, 12)],
    );
    await client.query(
      `INSERT INTO cys.app_usuario_roles (id_usuario, id_rol)
       SELECT $1, id FROM cys.app_roles WHERE codigo IN ('administrador', 'desarrollador') ON CONFLICT DO NOTHING`,
      [rows[0].id_usuario],
    );
    await client.query("COMMIT");
    console.log(`✓ Administrador inicial «${usuario}» creado`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
