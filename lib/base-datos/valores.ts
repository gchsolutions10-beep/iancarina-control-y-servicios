/** Convierte lo que devuelve la base a texto para mostrar/editar en la consola. */
export function aTextoConsola(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString().replace("T", " ").replace(/\.000Z$|Z$/, "");
  if (typeof valor === "bigint") return valor.toString();
  if (typeof valor === "object") {
    if (valor instanceof Uint8Array) return `<binario ${valor.length} bytes>`;
    if ("toFixed" in valor && typeof (valor as { toString(): string }).toString === "function") return String(valor); // Decimal
    return JSON.stringify(valor);
  }
  return String(valor);
}

/** Solo identificadores simples: nunca se interpola texto del usuario como SQL. */
export const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/;
export const ident = (s: string) => `"${s.replaceAll('"', '""')}"`;
