import { redirect } from "next/navigation";
import { areasVisibles } from "@/lib/auth/areas-visibles";
import { requerirSesion } from "@/lib/auth/dal";
import { RecordarDesplazamiento } from "./recordar-desplazamiento";
import { SeccionesArea } from "./modulos-area";

/** Pestaña de un área: solo sus módulos habilitados para el usuario. */
export async function PaginaArea({ id }: { id: string }) {
  const usuario = await requerirSesion();
  const area = areasVisibles(usuario).find((a) => a.id === id);
  if (!area) redirect("/sin-acceso");

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <RecordarDesplazamiento clave={`area-${id}`} />
      <header className="mb-8 animate-entrada">
        <h1 className="text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">{area.nombre}</h1>
      </header>
      <SeccionesArea area={area} />
    </main>
  );
}
