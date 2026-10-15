import type { Metadata } from "next";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { guia } from "@/lib/ayuda/guias";
import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";
import { claseBoton } from "@/components/ui/boton";
import { claseControl, MensajeEstado } from "@/components/ui/campo";
import { comoGestor, requerirSesion } from "@/lib/auth/dal";
import { empresasGestionables, puedeGestionarUsuarios } from "@/lib/usuarios/alcance";
import { nombresEmpresas } from "@/lib/empresas";
import { redirect } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatearInstante } from "@/lib/tiempo";
import { listarUsuarios } from "@/lib/usuarios/datos";

export const metadata: Metadata = { title: "Usuarios" };

const FILTROS = [
  { valor: "activos", etiqueta: "Activos" },
  { valor: "bloqueados", etiqueta: "Bloqueados" },
  { valor: "todos", etiqueta: "Todos" },
] as const;

export default async function Usuarios({ searchParams }: PageProps<"/admin/usuarios">) {
  const gestor = comoGestor(await requerirSesion());
  if (!puedeGestionarUsuarios(gestor)) redirect("/sin-acceso");
  const p = await searchParams;
  const mios = empresasGestionables(gestor);
  const buscar = typeof p.q === "string" ? p.q.trim() : "";
  const filtro = FILTROS.find((f) => f.valor === p.estado)?.valor ?? "activos";

  const [todos, nombres] = await Promise.all([listarUsuarios(gestor), nombresEmpresas()]);
  const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const usuarios = todos.filter(
    (u) =>
      (filtro === "todos" || (filtro === "bloqueados") === u.bloqueado) &&
      (!buscar || normalizar(`${u.nombre} ${u.usuario} ${u.cargo ?? ""}`).includes(normalizar(buscar))),
  );

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">Usuarios</h1>
            <p className="mt-1 text-sm text-tinta-suave">
              {mios.length === gestor.acceso.todas.length ? "Todas las empresas" : `Gestionas: ${mios.map((d) => nombres[d] ?? d).join(", ")}`}
            </p>
          </div>
          <AyudaModulo guia={guia("usuarios")} />
        </div>
        <Link href="/admin/usuarios/nuevo" className={claseBoton("primario", "lg")}>
          <Plus className="size-4" aria-hidden />
          Nuevo usuario
        </Link>
      </header>

      {typeof p.creado === "string" && (
        <div className="mb-4">
          <MensajeEstado tipo="exito">Usuario creado.</MensajeEstado>
        </div>
      )}

      <form method="get" className="flex flex-wrap items-center gap-3" aria-label="Buscar usuarios">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-tenue" aria-hidden />
          <input type="search" name="q" defaultValue={buscar} placeholder="Nombre, usuario o cargo" className={cn(claseControl, "pl-9")} />
        </label>
        <input type="hidden" name="estado" value={filtro} />
        <nav aria-label="Estado" className="flex gap-1 rounded-lg border border-borde bg-superficie p-1 shadow-xs">
          {FILTROS.map((f) => (
            <Link
              key={f.valor}
              href={`/admin/usuarios?estado=${f.valor}${buscar ? `&q=${encodeURIComponent(buscar)}` : ""}`}
              aria-current={filtro === f.valor ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ease-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40",
                filtro === f.valor ? "bg-superficie-2 font-medium text-tinta" : "text-tinta-suave hover:text-tinta",
              )}
            >
              {f.etiqueta}
            </Link>
          ))}
        </nav>
      </form>

      <section aria-label="Usuarios" className="mt-4 overflow-hidden rounded-xl border border-borde bg-superficie shadow-xs">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-borde bg-superficie-2 text-tinta-suave">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Usuario</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Empresas y rol</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Último acceso</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Estado</th>
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="group relative border-b border-borde last:border-0 hover:bg-superficie-2/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/usuarios/${u.id}`}
                      className="font-medium text-tinta after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-marca-600/40"
                    >
                      {u.nombre}
                    </Link>
                    <p className="text-xs text-tinta-tenue">
                      {u.usuario}
                      {u.cargo ? ` · ${u.cargo}` : ""}
                    </p>
                  </td>
                  <td className="max-w-96 px-4 py-3 text-tinta-suave">
                    {u.globales.includes("administrador") && <p className="font-medium text-tinta">Administrador</p>}
                    {u.empresas.map((d) => (
                      <p key={d.texto} className={cn(d.vencida && "text-tinta-tenue line-through")}>
                        {d.texto}
                        {d.hasta && !d.vencida && <span className="text-xs text-tinta-tenue"> · hasta {d.hasta}</span>}
                      </p>
                    ))}
                    {u.globales.length === 0 && u.empresas.length === 0 && "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-tinta-suave">
                    {u.ultimoAcceso ? formatearInstante(u.ultimoAcceso) : "Nunca"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {u.bloqueado ? (
                      <span className="font-medium text-error">Bloqueado</span>
                    ) : u.bloqueoTemporal ? (
                      <span className="text-marca-700 dark:text-marca-400">Bloqueo por intentos</span>
                    ) : u.claveTemporal ? (
                      <span className="text-tinta-suave">Clave temporal</span>
                    ) : (
                      <span className="text-exito">Activo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tinta-tenue">
                    <ArrowRight className="size-4 transition-transform duration-150 ease-suave group-hover:translate-x-0.5" aria-hidden />
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-tinta-suave">
                    No hay usuarios con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-borde bg-superficie-2 px-4 py-2.5 text-sm text-tinta-suave">
          {usuarios.length} de {todos.length} usuarios
        </p>
      </section>
    </main>
  );
}
