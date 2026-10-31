import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { cerrarSesion } from "@/actions/auth";
import { CreditoGch } from "@/components/marca/credito-gch";
import { Logo } from "@/components/marca/logo";
import { Campana } from "@/components/sistema/campana";
import { Recorridos } from "@/components/sistema/recorridos";
import { db } from "@/lib/db";
import { Navegacion, type EnlaceNavegacion } from "@/components/sistema/navegacion";
import { claseBoton } from "@/components/ui/boton";
import { SelectorTema } from "@/components/ui/selector-tema";
import { areasVisibles } from "@/lib/auth/areas-visibles";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { opcionesConfiguracion } from "@/lib/configuracion";
import { empresasDe } from "@/lib/fichas/acceso";
import { COOKIE_TEMA, leerTema } from "@/lib/tema";
import { cookies } from "next/headers";

export default async function LayoutSistema({ children }: LayoutProps<"/">) {
  const usuario = await requerirSesion();
  const tema = leerTema((await cookies()).get(COOKIE_TEMA)?.value);

  // Menú corto: Inicio, una pestaña por área (hoy «Gestión de Pólizas»; luego «Presupuestos»),
  // Configuración, Programador (solo administrador) y Manual.
  const configuracion = opcionesConfiguracion(usuario);
  const vistos = (await db.app_recorridos_vistos.findMany({ where: { id_usuario: usuario.id }, select: { recorrido: true } })).map((r) => r.recorrido);
  const enlaces: EnlaceNavegacion[] = [
    { href: "/inicio", etiqueta: "Inicio" },
    ...areasVisibles(usuario).map((a) => ({ href: `/${a.id}`, etiqueta: a.pestana, activoEn: a.prefijos })),
    ...(configuracion.length > 0 ? [{ href: "/configuracion", etiqueta: "Configuración", activoEn: ["/configuracion", ...configuracion.map((o) => o.ruta)] }] : []),
    ...(tienePermiso(usuario, "admin.sistema") ? [{ href: "/admin/base-datos", etiqueta: "Programador" }] : []),
    { href: "/manual", etiqueta: "Manual" },
  ];

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-borde bg-superficie/90 backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/inicio" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40">
            <Logo />
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-medium text-tinta">{usuario.nombre}</p>
              <p className="truncate text-xs text-tinta-tenue">
                {usuario.rolVisible ?? usuario.cargo ?? usuario.usuario}
                {tienePermiso(usuario, "sistema.desarrollador") && (
                  <span className="ml-1.5 rounded-full bg-marca-600/10 px-1.5 py-0.5 text-[10px] font-medium text-marca-700 dark:text-marca-400">
                    Desarrollador
                  </span>
                )}
              </p>
            </div>
            {empresasDe(usuario, "seguros.ver").length > 0 && <Campana abrirSola={usuario.notificaciones.alertas} />}
            <SelectorTema inicial={tema} />
            <Link href="/cuenta/clave" className={claseBoton("fantasma", "md")} aria-label="Cambiar mi clave">
              <KeyRound className="size-4" aria-hidden />
              <span className="hidden lg:inline">Mi clave</span>
            </Link>
            <form action={cerrarSesion}>
              <button type="submit" className={claseBoton("secundario", "md")} aria-label="Cerrar sesión">
                <LogOut className="size-4" aria-hidden />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-2 sm:px-4">
          <Navegacion enlaces={enlaces} />
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>
      <Recorridos vistos={vistos} />

      <footer className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 print:hidden">
        <CreditoGch />
      </footer>
    </>
  );
}
