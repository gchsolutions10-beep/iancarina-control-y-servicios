import Link from "next/link";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { guia } from "@/lib/ayuda/guias";
import { cn } from "@/lib/cn";

const SECCIONES = [
  { href: "/admin/base-datos", etiqueta: "Datos de ejemplo y limpieza" },
  { href: "/admin/base-datos/tablas", etiqueta: "Tablas y vistas" },
  { href: "/admin/base-datos/sql", etiqueta: "Consola SQL" },
] as const;

/** Encabezado y pestañas de Base de datos (solo administrador). */
export function SubnavegacionBaseDatos({ actual }: { actual: (typeof SECCIONES)[number]["href"] }) {
  return (
    <>
      <header className="mb-4 flex items-start gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">Base de datos</h1>
          <p className="mt-1 text-sm text-tinta-suave">Solo el administrador. Cada cambio queda en la bitácora (módulo «BASE DE DATOS»).</p>
        </div>
        <AyudaModulo guia={guia("base-datos")} />
      </header>
      <nav aria-label="Secciones de base de datos" className="mb-6 inline-flex flex-wrap gap-1 rounded-lg border border-borde bg-superficie p-1 shadow-xs">
        {SECCIONES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            aria-current={s.href === actual ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ease-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40",
              s.href === actual ? "bg-superficie-2 font-medium text-tinta" : "text-tinta-suave hover:text-tinta",
            )}
          >
            {s.etiqueta}
          </Link>
        ))}
      </nav>
    </>
  );
}
