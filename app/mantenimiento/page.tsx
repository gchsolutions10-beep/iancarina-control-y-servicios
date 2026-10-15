import type { Metadata } from "next";
import { Logo } from "@/components/marca/logo";

export const metadata: Metadata = { title: "En mantenimiento" };

/** Se muestra en todas las rutas cuando MODO_MANTENIMIENTO=true (copia o cambio de base). */
export default function Mantenimiento() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <Logo variante="completo" alto={72} />
      <h1 className="mt-8 text-xl font-semibold tracking-tight text-tinta">Estamos actualizando el sistema</h1>
      <p className="mt-2 text-sm text-pretty text-tinta-suave">
        Por unos minutos no es posible registrar información. Vuelve a intentarlo más tarde; no se perdió ningún dato.
      </p>
    </main>
  );
}
