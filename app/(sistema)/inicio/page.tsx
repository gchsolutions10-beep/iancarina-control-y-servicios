import type { Metadata } from "next";
import { areasVisibles } from "@/lib/auth/areas-visibles";
import { requerirSesion } from "@/lib/auth/dal";
import { formatearFechaLarga } from "@/lib/formato";
import { RecordarDesplazamiento } from "@/components/sistema/recordar-desplazamiento";
import { SeccionesArea } from "@/components/sistema/modulos-area";
import { PrimerosPasos } from "@/components/ayuda/primeros-pasos";
import { ID_PRIMEROS_PASOS, primerosPasos } from "@/lib/ayuda/primeros-pasos";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Inicio" };

export default async function Inicio() {
  const usuario = await requerirSesion();
  const areas = areasVisibles(usuario);
  const primerNombre = usuario.nombre.split(" ")[0];
  const oculto = await db.app_recorridos_vistos.findUnique({ where: { id_usuario_recorrido: { id_usuario: usuario.id, recorrido: ID_PRIMEROS_PASOS } } });
  const pasos = oculto ? null : await primerosPasos(usuario);
  // Se muestra hasta que el usuario lo oculta o completa todas las tareas.
  const mostrarPasos = pasos && pasos.some((p) => p.hecho === false);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <RecordarDesplazamiento clave="inicio" />
      <header className="mb-8 animate-entrada">
        <p className="text-sm text-tinta-tenue first-letter:uppercase">{formatearFechaLarga(new Date())}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">Hola, {primerNombre}</h1>
      </header>

      {mostrarPasos && <PrimerosPasos pasos={pasos} />}

      {areas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-borde-fuerte bg-superficie px-6 py-14 text-center">
          <p className="font-medium text-tinta">Todavía no tienes módulos asignados</p>
          <p className="mt-1 text-sm text-tinta-suave">Pide al administrador que te asigne un rol.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {areas.map((area) => (
            <section key={area.id} aria-labelledby={`area-${area.id}`}>
              <h2 id={`area-${area.id}`} className="text-lg font-semibold tracking-tight text-tinta">
                {area.nombre}
              </h2>
              <SeccionesArea area={area} className="mt-4" />
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
