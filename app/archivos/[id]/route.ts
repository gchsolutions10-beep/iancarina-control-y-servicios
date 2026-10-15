import { registrarGestion } from "@/lib/auditoria";
import { obtenerUsuarioActual, tienePermiso } from "@/lib/auth/dal";
import { leerContenido } from "@/lib/archivos/almacen";
import { db } from "@/lib/db";

/**
 * Abre un archivo por su id, solo con sesión y acceso a su empresa. Los documentos confidenciales
 * exigen «personas.datos_sensibles». Cada apertura de un documento (no de fotos) queda en la bitácora.
 */
export async function GET(request: Request, { params }: RouteContext<"/archivos/[id]">) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return new Response("Inicia sesión", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("No encontrado", { status: 404 });

  const archivo = await db.archivos.findUnique({ where: { id }, include: { documentos: { select: { id: true, confidencial: true, id_parte: true, id_vehiculo: true, id_propiedad: true } } } });
  // Mismo «no encontrado» si no existe o si no tiene acceso: no revela qué hay en otras empresas.
  if (!archivo || !tienePermiso(usuario, "seguros.ver", archivo.empresa)) return new Response("No encontrado", { status: 404 });
  const confidencial = archivo.documentos.some((d) => d.confidencial);
  if (confidencial && !tienePermiso(usuario, "personas.datos_sensibles", archivo.empresa)) return new Response("No encontrado", { status: 404 });

  const contenido = await leerContenido(archivo);
  if (!contenido) return new Response("El archivo no está disponible en el almacenamiento", { status: 410 });

  const doc = archivo.documentos[0];
  if (doc && !archivo.es_imagen) {
    const [entidad, idRegistro] = doc.id_parte ? ["partes", doc.id_parte] : doc.id_vehiculo ? ["vehiculos", doc.id_vehiculo] : ["propiedades", doc.id_propiedad];
    await registrarGestion(usuario.id, "DOCUMENTOS", `ID ${idRegistro} | DOCUMENTO ${doc.id} ABIERTO «${archivo.nombre}»`, undefined, {
      empresa: archivo.empresa,
      entidad: entidad as string,
      idRegistro: idRegistro ?? undefined,
      operacion: "CONSULTA",
    });
  }
  const descargar = new URL(request.url).searchParams.has("descargar") || !(archivo.es_imagen || archivo.tipo_mime === "application/pdf");
  return new Response(new Uint8Array(contenido), {
    headers: {
      "Content-Type": archivo.tipo_mime,
      "Content-Length": String(contenido.length),
      "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox",
    },
  });
}
