/** Resultado de una Server Action de formulario. `aviso`: información neutra (p. ej. una simulación). */
export type EstadoAccion = { ok?: boolean; mensaje?: string; aviso?: string; error?: string; errores?: Record<string, string | undefined> } | null;
