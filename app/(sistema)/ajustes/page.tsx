import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormularioAjuste } from "@/components/ajustes/formulario-ajuste";
import { Tarjeta } from "@/components/ui/tarjeta";
import { ajuste, AJUSTES, type ClaveAjuste } from "@/lib/ajustes";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Ajustes del sistema" };

export default async function Ajustes() {
  const usuario = await requerirSesion();
  const esAdmin = tienePermiso(usuario, "admin.sistema");
  const esDesarrollador = tienePermiso(usuario, "sistema.desarrollador");
  if (!esAdmin && !esDesarrollador) redirect("/sin-acceso");

  const claves = Object.keys(AJUSTES) as ClaveAjuste[];
  const valores = await Promise.all(claves.map((c) => ajuste(c)));
  const grupos = Map.groupBy(
    claves.map((clave, i) => ({ clave, valor: valores[i], ...AJUSTES[clave] })),
    (a) => a.grupo,
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">Ajustes del sistema</h1>
        <p className="mt-1 text-tinta-suave">Parámetros del sistema. Cada cambio aplica de inmediato y queda en la bitácora.</p>
      </header>
      <div className="flex flex-col gap-6">
        {[...grupos].map(([grupo, ajustes]) => (
          <Tarjeta key={grupo} titulo={grupo}>
            <div className="flex flex-col gap-4">
              {ajustes.map((a) => (
                <FormularioAjuste
                  key={a.clave}
                  clave={a.clave}
                  titulo={a.titulo}
                  detalle={a.detalle}
                  tipo={a.tipo}
                  valor={a.valor}
                  defecto={a.defecto}
                  editable={tienePermiso(usuario, a.editor)}
                />
              ))}
            </div>
          </Tarjeta>
        ))}
      </div>
    </main>
  );
}
