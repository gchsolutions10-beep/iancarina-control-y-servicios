import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { variable } from "@/lib/entorno";

/**
 * Prisma Client único por proceso. En desarrollo, el hot reload re-ejecuta los
 * módulos; guardarlo en globalThis evita abrir un pool nuevo en cada cambio.
 */
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

function crearCliente() {
  const connectionString = variable("DATABASE_URL");
  if (!connectionString) throw new Error("Falta la variable de entorno DATABASE_URL");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db = globalParaPrisma.prisma ?? crearCliente();

if (process.env.NODE_ENV !== "production") globalParaPrisma.prisma = db;
