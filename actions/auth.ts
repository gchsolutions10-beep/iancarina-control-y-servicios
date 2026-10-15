"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { registrarGestion } from "@/lib/auditoria";
import { db } from "@/lib/db";
import { COOKIE_SESION, firmarSesion, opcionesCookieSesion } from "@/lib/auth/sesion";
import { inicioSesionSchema, type EstadoInicioSesion } from "@/lib/validations/auth";

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;
// Hash de una clave aleatoria: se compara cuando el usuario no existe para que
// el tiempo de respuesta no revele qué nombres de usuario son válidos.
const HASH_SENUELO = "$2b$12$KvDYIXeHTUT.ejydTDTpKeZKNR8rp7WGoTzhp8lVAgqx7NzD0Le2q";

const MENSAJE_CREDENCIALES = "Usuario o contraseña incorrectos";

export async function iniciarSesion(
  _estadoPrevio: EstadoInicioSesion,
  formData: FormData,
): Promise<EstadoInicioSesion> {
  const entrada = inicioSesionSchema.safeParse({
    usuario: formData.get("usuario"),
    clave: formData.get("clave"),
    siguiente: formData.get("siguiente") ?? undefined,
  });

  if (!entrada.success) {
    const errores = entrada.error.flatten().fieldErrors;
    return {
      usuario: String(formData.get("usuario") ?? ""),
      campos: { usuario: errores.usuario?.[0], clave: errores.clave?.[0] },
    };
  }

  const { usuario: nombreUsuario, clave, siguiente } = entrada.data;
  const conError = (error: string): EstadoInicioSesion => ({ error, usuario: nombreUsuario });

  let destino: string;
  try {
    const usuario = await db.app_usuarios.findFirst({
      where: { nombre_usuario: { equals: nombreUsuario, mode: "insensitive" } },
    });

    // Sin clave web: no entra.
    if (!usuario || !usuario.clave_hash) {
      await bcrypt.compare(clave, HASH_SENUELO);
      return conError(MENSAJE_CREDENCIALES);
    }

    if (usuario.bloqueado) {
      return conError("Tu usuario está bloqueado. Comunícate con tu gerente o con el administrador.");
    }

    if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > new Date()) {
      const minutos = Math.ceil((usuario.bloqueado_hasta.getTime() - Date.now()) / 60_000);
      return conError(`Demasiados intentos fallidos. Intenta de nuevo en ${minutos} min.`);
    }

    if (!(await bcrypt.compare(clave, usuario.clave_hash))) {
      const intentos = usuario.intentos_fallidos + 1;
      const bloquear = intentos >= MAX_INTENTOS;
      await db.app_usuarios.update({
        where: { id_usuario: usuario.id_usuario },
        data: {
          intentos_fallidos: bloquear ? 0 : intentos,
          bloqueado_hasta: bloquear ? new Date(Date.now() + MINUTOS_BLOQUEO * 60_000) : null,
        },
      });
      return conError(
        bloquear
          ? `Demasiados intentos fallidos. Intenta de nuevo en ${MINUTOS_BLOQUEO} min.`
          : MENSAJE_CREDENCIALES,
      );
    }

    await db.app_usuarios.update({
      where: { id_usuario: usuario.id_usuario },
      data: { intentos_fallidos: 0, bloqueado_hasta: null, ultimo_acceso: new Date() },
    });

    await registrarGestion(usuario.id_usuario, "WEB", "Inicio de sesión");

    const token = await firmarSesion({
      sub: String(usuario.id_usuario),
      usuario: usuario.nombre_usuario,
      nombre: usuario.nombre_apellido.trim() || usuario.nombre_usuario,
    });
    (await cookies()).set(COOKIE_SESION, token, opcionesCookieSesion());
    destino = siguiente ?? "/inicio";
  } catch (error) {
    console.error("[iniciarSesion]", error);
    return conError("No pudimos conectar con el servidor. Intenta de nuevo en un momento.");
  }

  // redirect() lanza una excepción de control: debe quedar fuera del try/catch.
  redirect(destino);
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE_SESION);
  redirect("/");
}
