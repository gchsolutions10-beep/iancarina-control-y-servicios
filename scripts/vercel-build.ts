/**
 * Paso previo a `next build` en Vercel (script «vercel-build»):
 *   1. Base: aplica las migraciones pendientes (crea las tablas en Neon sin pasos manuales).
 *      Con PREPARAR_DEMO=true también carga los datos de demostración (solo en tablas vacías).
 *   2. Primer administrador: si ADMIN_INICIAL_USUARIO y ADMIN_INICIAL_CLAVE están definidas y ese
 *      usuario todavía no existe, lo crea (administrador + desarrollador). Si ya existe no lo toca,
 *      así un cambio de clave hecho desde la web no se pierde en el siguiente despliegue.
 *      Después del primer ingreso se pueden borrar esas dos variables en Vercel.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { administradorInicial } from "./lib/administrador-inicial";

const tsx = (script: string, ...args: string[]) =>
  execFileSync(process.execPath, [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), script, ...args], { stdio: "inherit" });

async function main() {
  if (process.env.PREPARAR_DEMO?.trim() === "true") tsx("scripts/migrar.ts", "--semilla");
  else tsx("scripts/migrar.ts");
  await administradorInicial();
}

main().catch((error: unknown) => {
  console.error("✗", error instanceof Error ? error.message : error);
  process.exit(1);
});
