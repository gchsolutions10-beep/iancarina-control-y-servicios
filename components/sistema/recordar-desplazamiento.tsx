"use client";

import { useEffect } from "react";

/** Guarda dónde estaba el usuario en la página y lo devuelve ahí al regresar (por pestaña). */
export function RecordarDesplazamiento({ clave }: { clave: string }) {
  useEffect(() => {
    const llave = `desplazamiento:${clave}`;
    const ruta = window.location.pathname;
    let guardado = 0;
    try {
      guardado = Number(sessionStorage.getItem(llave)) || 0;
    } catch {}
    // Next sube la página al llegar: se restaura después de que termine la navegación.
    const restaurar = () => guardado && window.scrollTo({ top: guardado });
    const temporizadores = [0, 60, 200].map((ms) => window.setTimeout(restaurar, ms));

    let pendiente = 0;
    const alDesplazar = () => {
      cancelAnimationFrame(pendiente);
      pendiente = requestAnimationFrame(() => {
        // Al salir hacia otra pantalla la ventana vuelve arriba: eso no se guarda.
        if (window.location.pathname !== ruta) return;
        try {
          sessionStorage.setItem(llave, String(Math.round(window.scrollY)));
        } catch {}
      });
    };
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => {
      temporizadores.forEach(clearTimeout);
      cancelAnimationFrame(pendiente);
      window.removeEventListener("scroll", alDesplazar);
    };
  }, [clave]);
  return null;
}
