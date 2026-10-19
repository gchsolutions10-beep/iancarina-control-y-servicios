import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { ContenidoGuia } from "@/components/ayuda/ayuda-modulo";
import { GUIAS, REGLAS_GENERALES } from "@/lib/ayuda/guias";
import type { Guia } from "@/lib/ayuda/tipos";
import { areasVisibles } from "@/lib/auth/areas-visibles";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { opcionesConfiguracion } from "@/lib/configuracion";

export const metadata: Metadata = { title: "Manual" };

/**
 * Manual del usuario armado con las guías de las pantallas que este usuario puede usar
 * (cada rol lee solo lo suyo). Las guías son las mismas del botón «i» de cada módulo.
 */
export default async function Manual() {
  const usuario = await requerirSesion();
  const grupos: { titulo: string; guias: Guia[] }[] = [];
  for (const area of areasVisibles(usuario)) {
    for (const seccion of area.secciones) {
      const guias = seccion.modulos.filter((m) => m.ruta && GUIAS[m.id]).map((m) => GUIAS[m.id]);
      if (guias.length) grupos.push({ titulo: seccion.nombre, guias });
    }
  }
  const configuracion = opcionesConfiguracion(usuario).filter((o) => GUIAS[o.id]).map((o) => GUIAS[o.id]);
  if (configuracion.length) grupos.push({ titulo: "Configuración", guias: configuracion });
  if (tienePermiso(usuario, "admin.sistema")) grupos.push({ titulo: "Programador", guias: [GUIAS["base-datos"]] });
  const vistas = new Set<string>();
  for (const g of grupos) g.guias = g.guias.filter((x) => !vistas.has(x.id) && vistas.add(x.id));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">
          <BookOpen className="size-7 text-tinta-suave" aria-hidden />
          Manual
        </h1>
        <p className="mt-1 text-tinta-suave">Cómo usar las pantallas que tiene asignadas. Cada guía también está en el botón «i» junto al título de su pantalla.</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Contenido del manual" className="lg:sticky lg:top-24 lg:self-start">
          <ol className="flex flex-col gap-3 text-sm">
            <li>
              <a href="#reglas-generales" className="font-medium text-tinta hover:text-marca-600 dark:hover:text-marca-400">
                Reglas generales
              </a>
            </li>
            {grupos.map((g) => (
              <li key={g.titulo}>
                <p className="text-xs font-semibold tracking-wide text-tinta-tenue uppercase">{g.titulo}</p>
                <ol className="mt-1 flex flex-col gap-1">
                  {g.guias.map((x) => (
                    <li key={x.id}>
                      <a href={`#${x.id}`} className="text-tinta-suave hover:text-tinta">
                        {x.titulo}
                      </a>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <section id="reglas-generales" className="scroll-mt-24 rounded-xl border border-borde bg-superficie p-6 shadow-xs">
            <h2 className="text-lg font-semibold text-tinta">Reglas generales</h2>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-tinta-suave">
              {REGLAS_GENERALES.map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-tinta-tenue" />
                  {r}
                </li>
              ))}
            </ul>
          </section>
          {grupos.flatMap((g) =>
            g.guias.map((x) => (
              <section key={x.id} id={x.id} className="scroll-mt-24 rounded-xl border border-borde bg-superficie p-6 shadow-xs">
                <p className="text-xs font-semibold tracking-wide text-tinta-tenue uppercase">{g.titulo}</p>
                <h2 className="mt-1 text-lg font-semibold text-tinta">{x.titulo}</h2>
                <div className="mt-3">
                  <ContenidoGuia guia={x} />
                </div>
              </section>
            )),
          )}
          {grupos.length === 0 && <p className="text-sm text-tinta-suave">Todavía no tiene pantallas asignadas.</p>}
        </div>
      </div>
    </main>
  );
}
