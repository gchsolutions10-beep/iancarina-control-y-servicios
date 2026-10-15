"use client";

import { useEffect } from "react";

/** En la versión para imprimir abre el diálogo de impresión (desde ahí se guarda como PDF). */
export function ImprimirAlCargar() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
