import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requerirSesion } from "@/lib/auth/dal";
import { opcionesConfiguracion } from "@/lib/configuracion";

export const metadata: Metadata = { title: "Configuración" };

/** Pestaña «Configuración»: usuarios, empresas, catálogos, reglas, flujos y ajustes (según permisos). */
export default async function Configuracion() {
  const usuario = await requerirSesion();
  const opciones = opcionesConfiguracion(usuario);
  if (opciones.length === 0) redirect("/sin-acceso");
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8 animate-entrada">
        <h1 className="text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">Configuración</h1>
        <p className="mt-1 text-sm text-tinta-suave">Quién entra al sistema y cómo se comporta. Todo cambio queda en la bitácora.</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {opciones.map(({ id, nombre, descripcion, ruta, icono: Icono }) => (
          <li key={id}>
            <Link
              href={ruta}
              className="group flex h-full items-start gap-3 rounded-xl border border-borde bg-superficie px-4 py-4 shadow-xs transition-colors duration-150 ease-suave hover:border-borde-fuerte hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-borde bg-marca-50 text-marca-600 dark:bg-marca-950/40">
                <Icono className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-tinta">{nombre}</span>
                <span className="mt-0.5 block text-sm text-tinta-suave">{descripcion}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 self-center text-tinta-tenue transition-transform duration-150 ease-suave group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
