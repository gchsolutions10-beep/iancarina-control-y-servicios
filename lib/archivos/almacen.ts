import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { ajuste } from "@/lib/ajustes";
import { db } from "@/lib/db";
import { variable } from "@/lib/entorno";
import { detectarTipo, nombreSeguro, TIPOS_PERMITIDOS } from "./tipos";

/**
 * Dónde se guardan los archivos. La base solo guarda metadatos y una clave generada aquí.
 * - «nube»: Vercel Blob privado (demo). Requiere BLOB_STORE_ID (o BLOB_READ_WRITE_TOKEN).
 * - «carpeta»: carpeta compartida montada en el servidor (intranet). Requiere ARCHIVOS_RUTA_BASE.
 * ALMACEN fuerza uno; si falta, se usa la carpeta si hay ruta y si no, la nube si hay token.
 */
type Almacen = {
  nombre: "nube" | "carpeta";
  guardar(clave: string, contenido: Buffer, mime: string): Promise<void>;
  leer(clave: string): Promise<Buffer | null>;
};

const nube: Almacen = {
  nombre: "nube",
  async guardar(clave, contenido, mime) {
    await put(clave, contenido, { access: "private", contentType: mime, addRandomSuffix: false, allowOverwrite: false });
  },
  async leer(clave) {
    const r = await get(clave, { access: "private" });
    if (!r || r.statusCode !== 200) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  },
};

/** Ruta absoluta dentro de la carpeta base; la clave la genera el servidor, pero igual se verifica. */
function rutaEnCarpeta(clave: string): string {
  const base = path.resolve(/*turbopackIgnore: true*/ variable("ARCHIVOS_RUTA_BASE") ?? "");
  const ruta = path.resolve(/*turbopackIgnore: true*/ base, clave);
  if (!ruta.startsWith(base + path.sep)) throw new Error("Ruta de archivo fuera de la carpeta permitida");
  return ruta;
}

const carpeta: Almacen = {
  nombre: "carpeta",
  async guardar(clave, contenido) {
    const ruta = rutaEnCarpeta(clave);
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(ruta, contenido, { flag: "wx" }); // nunca sobrescribe
  },
  async leer(clave) {
    return readFile(rutaEnCarpeta(clave)).catch(() => null);
  },
};

export function almacenActivo(): Almacen | null {
  const forzado = variable("ALMACEN");
  if (forzado === "carpeta" || (!forzado && variable("ARCHIVOS_RUTA_BASE"))) return variable("ARCHIVOS_RUTA_BASE") ? carpeta : null;
  // Vercel conecta el Blob con BLOB_STORE_ID (credencial OIDC automática) o, en tiendas antiguas, con un token.
  if (forzado === "nube" || !forzado) return variable("BLOB_STORE_ID") || variable("BLOB_READ_WRITE_TOKEN") ? nube : null;
  return null;
}

const almacenPorNombre = (n: string) => (n === "nube" ? nube : carpeta);

export type ResultadoArchivo = { ok: true; id: string } | { ok: false; error: string };

/**
 * Valida (tamaño y tipo real por contenido) y guarda un archivo. Devuelve el id del registro en
 * cys.archivos. Debe llamarse después de verificar el permiso del usuario en `empresa`.
 */
export async function guardarArchivo(archivo: File, opciones: { empresa: string; usuario: number; soloImagen?: boolean }): Promise<ResultadoArchivo> {
  const almacen = almacenActivo();
  if (!almacen) return { ok: false, error: "La carga de archivos no está configurada en este servidor (falta el almacenamiento)." };
  const maximoMb = await ajuste("archivos.tamano_maximo_mb");
  if (archivo.size === 0) return { ok: false, error: `«${archivo.name}» está vacío.` };
  if (archivo.size > maximoMb * 1024 * 1024) return { ok: false, error: `«${archivo.name}» supera el máximo de ${maximoMb} MB.` };

  const contenido = Buffer.from(await archivo.arrayBuffer());
  const tipo = detectarTipo(contenido.subarray(0, 16), archivo.name);
  if (!tipo) return { ok: false, error: `«${archivo.name}»: tipo no permitido. Se aceptan PDF, JPG, PNG, WEBP, Word (.docx) y Excel (.xlsx).` };
  const info = TIPOS_PERMITIDOS[tipo];
  if (opciones.soloImagen && !info.imagen) return { ok: false, error: "Aquí solo se aceptan imágenes (JPG, PNG o WEBP)." };

  const id = randomUUID();
  const hoy = new Date().toISOString().slice(0, 7);
  const clave = `${opciones.empresa}/${hoy}/${id}.${info.extension}`;
  await almacen.guardar(clave, contenido, info.mime);
  await db.archivos.create({
    data: {
      id,
      empresa: opciones.empresa,
      almacen: almacen.nombre,
      clave,
      nombre: nombreSeguro(archivo.name),
      tipo_mime: info.mime,
      tamano: BigInt(contenido.length),
      sha256: createHash("sha256").update(contenido).digest("hex"),
      es_imagen: info.imagen,
      subido_por: opciones.usuario,
    },
  });
  return { ok: true, id };
}

/** Contenido de un archivo registrado (la autorización la hace quien llama). */
export async function leerContenido(archivo: { almacen: string; clave: string }): Promise<Buffer | null> {
  return almacenPorNombre(archivo.almacen).leer(archivo.clave);
}
