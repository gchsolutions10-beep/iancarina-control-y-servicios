/** Resultado de una Server Action de formulario. */
export type EstadoAccion = { ok?: boolean; mensaje?: string; error?: string; errores?: Record<string, string | undefined> } | null;
