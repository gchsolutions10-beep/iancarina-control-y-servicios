import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { variable } from "@/lib/entorno";

/**
 * Token de sesión (JWT HS256) guardado en la cookie HttpOnly `cys_sesion`.
 * Solo contiene la identidad: los permisos se leen de la BD en cada petición
 * (lib/auth/dal.ts), así un cambio de roles o un bloqueo aplica de inmediato.
 *
 * Este archivo no importa nada de servidor para poder usarse en proxy.ts.
 */
export const COOKIE_SESION = "cys_sesion";

const tokenSesionSchema = z.object({
  sub: z.string().regex(/^\d+$/),
  usuario: z.string().min(1),
  nombre: z.string(),
});

export type TokenSesion = z.infer<typeof tokenSesionSchema>;

export const duracionSesionSegundos = () => Number(variable("SESSION_HORAS", "12")) * 60 * 60;

function clave() {
  const secreto = variable("SESSION_SECRET");
  if (!secreto || secreto.length < 32) {
    throw new Error("SESSION_SECRET debe existir y tener al menos 32 caracteres");
  }
  return new TextEncoder().encode(secreto);
}

export async function firmarSesion(datos: TokenSesion): Promise<string> {
  return new SignJWT({ usuario: datos.usuario, nombre: datos.nombre })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(datos.sub)
    .setIssuedAt()
    .setExpirationTime(`${duracionSesionSegundos()}s`)
    .sign(clave());
}

export async function verificarSesion(token: string | undefined): Promise<TokenSesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, clave(), { algorithms: ["HS256"] });
    const resultado = tokenSesionSchema.safeParse(payload);
    return resultado.success ? resultado.data : null;
  } catch {
    return null;
  }
}

export function opcionesCookieSesion() {
  return {
    httpOnly: true,
    secure: variable("SESSION_COOKIE_SECURE") === "true",
    sameSite: "lax" as const,
    path: "/",
    maxAge: duracionSesionSegundos(),
  };
}
