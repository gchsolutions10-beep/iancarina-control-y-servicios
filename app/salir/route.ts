import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION } from "@/lib/auth/sesion";

/**
 * Cierra una sesión que dejó de ser válida (usuario bloqueado o eliminado) aunque la
 * cookie siga firmada. Sin esto, la portada redirige a /inicio y /inicio a la portada.
 */
export async function GET(request: NextRequest) {
  (await cookies()).delete(COOKIE_SESION);
  return NextResponse.redirect(new URL("/", request.url));
}
