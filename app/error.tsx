"use client";

import { useEffect } from "react";
import { claseBoton } from "@/components/ui/boton";

export default function ErrorGeneral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-xl font-semibold text-tinta">Algo salió mal</h1>
      <p className="mt-1 text-sm text-tinta-suave">
        No pudimos completar la operación. Si persiste, verifica la conexión con el servidor.
      </p>
      <button type="button" onClick={reset} className={claseBoton("primario", "md", "mt-6")}>
        Reintentar
      </button>
    </main>
  );
}
