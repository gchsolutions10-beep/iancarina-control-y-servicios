/** Clave temporal legible (sin 0/O ni 1/l/I). */
const azarSeguro = (n: number) => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % n;

export function generarClaveTemporal(azar: (n: number) => number = azarSeguro): string {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const mayus = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digitos = "23456789";
  const pick = (s: string) => s[azar(s.length)];
  return `${pick(mayus)}${Array.from({ length: 5 }, () => pick(letras)).join("")}-${Array.from({ length: 4 }, () => pick(digitos)).join("")}`;
}
