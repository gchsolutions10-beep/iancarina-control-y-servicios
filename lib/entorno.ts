/**
 * Lee una variable de entorno sin espacios, tabuladores ni saltos de línea alrededor
 * (al pegar valores en Vercel es fácil arrastrar uno). Vacía = no definida.
 */
export function variable(nombre: string): string | undefined;
export function variable(nombre: string, defecto: string): string;
export function variable(nombre: string, defecto?: string): string | undefined {
  const valor = process.env[nombre]?.trim();
  return valor ? valor : defecto;
}
