/** Preferencia de tema guardada en la cookie `tema` (la recuerda el navegador un año). */
export const COOKIE_TEMA = "tema";
export const TEMAS = ["sistema", "claro", "oscuro"] as const;
export type Tema = (typeof TEMAS)[number];

/** Sin preferencia guardada el sistema arranca en modo claro; luego manda la elección de cada persona. */
export const TEMA_POR_DEFECTO: Tema = "claro";

export const leerTema = (valor: string | undefined): Tema =>
  (TEMAS as readonly string[]).includes(valor ?? "") ? (valor as Tema) : TEMA_POR_DEFECTO;
