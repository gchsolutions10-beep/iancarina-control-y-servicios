import Link from "next/link";
import { Lock } from "lucide-react";
import { claseBoton } from "@/components/ui/boton";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { listarEmpresas } from "@/lib/empresas";

export default async function SinAcceso() {
  const usuario = await requerirSesion();
  // Instalación en blanco: el administrador todavía no creó ninguna empresa.
  const sinEmpresas = tienePermiso(usuario, "admin.sistema") && (await listarEmpresas()).length === 0;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-superficie-2 text-tinta-suave">
        <Lock className="size-5" aria-hidden />
      </span>
      {sinEmpresas ? (
        <>
          <h1 className="mt-4 text-xl font-semibold text-tinta">Primero cree una empresa</h1>
          <p className="mt-1 text-sm text-tinta-suave">Todos los datos pertenecen a una empresa. Créela en Configuración → Empresas y luego asígnele usuarios.</p>
          <Link href="/admin/empresas" className={claseBoton("primario", "md", "mt-6")}>
            Ir a Empresas
          </Link>
        </>
      ) : (
        <>
          <h1 className="mt-4 text-xl font-semibold text-tinta">No tienes acceso a esta sección</h1>
          <p className="mt-1 text-sm text-tinta-suave">Si crees que es un error, pide a tu gerente o al administrador que revise tus permisos.</p>
          <Link href="/inicio" className={claseBoton("secundario", "md", "mt-6")}>
            Volver al inicio
          </Link>
        </>
      )}
    </main>
  );
}
