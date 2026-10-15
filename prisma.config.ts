import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // `prisma generate` (postinstall) no necesita conexión; db pull sí.
    url: process.env.DATABASE_URL ?? "",
  },
});
