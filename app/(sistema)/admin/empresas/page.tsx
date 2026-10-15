import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { FormularioEmpresa } from "@/components/empresas/formulario-empresa";
import { Tarjeta } from "@/components/ui/tarjeta";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { listarEmpresas } from "@/lib/empresas";

export const metadata: Metadata = { title: "Empresas" };

export default async function Empresas() {
  const usuario = await requerirSesion();
  if (!tienePermiso(usuario, "admin.sistema")) redirect("/sin-acceso");
  const empresas = await listarEmpresas();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">Empresas</h1>
          <p className="mt-1 text-sm text-tinta-suave">Cada empresa se maneja por separado: un usuario solo ve las empresas donde tiene rol.</p>
        </div>
        <AyudaModulo guia={guia("empresas")} />
      </header>
      <div className="flex flex-col gap-6">
        <Tarjeta titulo="Nueva empresa">
          <FormularioEmpresa />
        </Tarjeta>
        {empresas.map((e) => (
          <Tarjeta key={e.codigo} titulo={e.activa ? e.nombre : `${e.nombre} (inactiva)`}>
            <FormularioEmpresa empresa={e} />
          </Tarjeta>
        ))}
      </div>
    </main>
  );
}
