/**
 * Tipos de archivo permitidos, detectados por su contenido (primeros bytes), no por la extensión.
 * Lógica pura: se prueba en tests/archivos.test.ts.
 */
export const TIPOS_PERMITIDOS = {
  pdf: { mime: "application/pdf", extension: "pdf", imagen: false },
  jpg: { mime: "image/jpeg", extension: "jpg", imagen: true },
  png: { mime: "image/png", extension: "png", imagen: true },
  webp: { mime: "image/webp", extension: "webp", imagen: true },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx", imagen: false },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", imagen: false },
} as const;

export type TipoArchivo = keyof typeof TIPOS_PERMITIDOS;

const empieza = (bytes: Uint8Array, firma: number[], desde = 0) => firma.every((b, i) => bytes[desde + i] === b);

/** Tipo real del archivo o null si no está permitido. Word/Excel (ZIP) se distinguen por la extensión. */
export function detectarTipo(bytes: Uint8Array, nombre: string): TipoArchivo | null {
  if (empieza(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (empieza(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  if (empieza(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (empieza(bytes, [0x52, 0x49, 0x46, 0x46]) && empieza(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (empieza(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const ext = nombre.toLowerCase().split(".").pop();
    if (ext === "docx") return "docx";
    if (ext === "xlsx") return "xlsx";
  }
  return null;
}

/** Nombre visible seguro: sin rutas ni caracteres de control, máximo 200 caracteres. */
export function nombreSeguro(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? "";
  const limpio = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "").trim();
  return (limpio || "archivo").slice(0, 200);
}
