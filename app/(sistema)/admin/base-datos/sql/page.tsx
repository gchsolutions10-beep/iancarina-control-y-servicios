import type { Metadata } from "next";
import { ConsolaSql } from "@/components/base-datos/consola-sql";
import { SubnavegacionBaseDatos } from "@/components/base-datos/subnavegacion";
import { requerirPermiso } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Consola SQL" };

export default async function PaginaSql() {
  await requerirPermiso("admin.sistema");
  return (
    <main className="mx-auto w-full max-w-[96rem] flex-1 px-4 py-8 sm:px-6">
      <SubnavegacionBaseDatos actual="/admin/base-datos/sql" />
      <ConsolaSql />
    </main>
  );
}
