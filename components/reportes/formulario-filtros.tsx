"use client";

import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Formulario GET de filtros: al cambiar una lista o una fecha se aplica solo; los textos se
 * aplican con Enter o con «Filtrar». Los campos vacíos no se escriben en la URL.
 * Sin JavaScript sigue funcionando como un formulario GET normal.
 */
export function FormularioFiltros({ accion, etiqueta, children }: { accion: string; etiqueta: string; children: ReactNode }) {
  const router = useRouter();

  function aplicar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [clave, valor] of new FormData(e.currentTarget)) {
      if (typeof valor === "string" && valor.trim() !== "") params.set(clave, valor.trim());
    }
    const consulta = params.toString();
    router.push(consulta ? `${accion}?${consulta}` : accion);
  }

  return (
    <form
      data-recorrido="filtros"
      method="get"
      action={accion}
      aria-label={etiqueta}
      onSubmit={aplicar}
      onChange={(e) => {
        const campo = e.target;
        if (campo instanceof HTMLSelectElement || (campo instanceof HTMLInputElement && campo.type === "date")) e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
