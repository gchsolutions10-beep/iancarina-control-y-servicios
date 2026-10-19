/**
 * Después de `prisma db pull`: Prisma toma los índices únicos PARCIALES (una obligación de prima por
 * período, una renovación viva, una reversión por imputación, transporte 1:1 por PK) como relaciones
 * 1:1 y el esquema no valida. Aquí esas relaciones inversas se dejan como listas. Se ejecuta solo con
 * `npm run db:introspeccion`.
 */
import { readFileSync, writeFileSync } from "node:fs";

const ruta = "prisma/schema.prisma";
let esquema = readFileSync(ruta, "utf8");
const listas = [
  ["other_imputaciones", "imputaciones"],
  ["other_poliza_periodos", "poliza_periodos"],
  ["obligaciones", "obligaciones"],
  ["siniestro_transporte", "siniestro_transporte"],
  ["siniestro_etapas", "siniestro_etapas"],
] as const;
for (const [campo, modelo] of listas) {
  esquema = esquema.replace(new RegExp(`(\\n  ${campo}\\s+)${modelo}\\?`, "g"), `$1${modelo}[]`);
}
writeFileSync(ruta, esquema);
console.log("✓ Relaciones de índices únicos parciales ajustadas en prisma/schema.prisma");
