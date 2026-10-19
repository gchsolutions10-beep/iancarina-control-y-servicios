import { obtenerUsuarioActual } from "@/lib/auth/dal";
import { avisosDe } from "@/lib/avisos/fuentes";

/** Avisos de la campana del usuario en sesión (se calculan al pedirlos). */
export async function GET() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return Response.json({ avisos: [] }, { status: 401 });
  return Response.json({ avisos: await avisosDe(usuario) }, { headers: { "Cache-Control": "no-store" } });
}
