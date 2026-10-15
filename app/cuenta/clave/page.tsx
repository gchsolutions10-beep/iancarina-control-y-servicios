import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, LogOut } from "lucide-react";
import { cerrarSesion } from "@/actions/auth";
import { Logo } from "@/components/marca/logo";
import { claseBoton } from "@/components/ui/boton";
import { FormularioMiClave } from "@/components/usuarios/formulario-mi-clave";
import { requerirSesionPendiente } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Cambiar mi clave" };

export default async function CambiarMiClave() {
  const usuario = await requerirSesionPendiente();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Logo />
          <form action={cerrarSesion}>
            <button type="submit" className={claseBoton("fantasma", "md")}>
              <LogOut className="size-4" aria-hidden />
              Salir
            </button>
          </form>
        </div>
        <section className="rounded-2xl border border-borde bg-superficie p-6 shadow-xs sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-tinta">
            {usuario.debeCambiarClave ? "Crea tu clave" : "Cambiar mi clave"}
          </h1>
          <p className="mt-1 mb-6 text-sm text-tinta-suave">
            {usuario.debeCambiarClave
              ? `Hola, ${usuario.nombre}. Entraste con una clave temporal: elige una propia para continuar.`
              : `${usuario.nombre} (${usuario.usuario})`}
          </p>
          <FormularioMiClave />
        </section>
        {!usuario.debeCambiarClave && (
          <Link href="/inicio" className="mt-4 inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
            <ChevronLeft className="size-4" aria-hidden />
            Volver al inicio
          </Link>
        )}
      </div>
    </main>
  );
}
