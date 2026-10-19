import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Table2 } from "lucide-react";
import { SubnavegacionBaseDatos } from "@/components/base-datos/subnavegacion";
import { requerirPermiso } from "@/lib/auth/dal";
import { listarObjetos } from "@/lib/base-datos/datos";

export const metadata: Metadata = { title: "Tablas y vistas" };

export default async function TablasBaseDatos() {
  await requerirPermiso("admin.sistema");
  const objetos = await listarObjetos();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <SubnavegacionBaseDatos actual="/admin/base-datos/tablas" />
      {(["tabla", "vista"] as const).map((tipo) => (
        <section key={tipo} aria-labelledby={`titulo-${tipo}`} className="mb-8">
          <h2 id={`titulo-${tipo}`} className="mb-3 font-medium text-tinta">
            {tipo === "tabla" ? "Tablas" : "Vistas (solo lectura)"}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {objetos
              .filter((o) => o.tipo === tipo)
              .map((o) => (
                <li key={o.nombre}>
                  <Link
                    href={`/admin/base-datos/t/${o.nombre}`}
                    className="flex items-center gap-2 rounded-lg border border-borde bg-superficie px-3 py-2 text-sm shadow-xs transition-colors duration-150 ease-suave hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40"
                  >
                    {tipo === "tabla" ? <Table2 className="size-4 shrink-0 text-tinta-tenue" aria-hidden /> : <Eye className="size-4 shrink-0 text-tinta-tenue" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate font-mono text-tinta">{o.nombre}</span>
                    {o.filas !== null && <span className="text-xs tabular-nums text-tinta-tenue">~{o.filas.toLocaleString("es-VE")}</span>}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
