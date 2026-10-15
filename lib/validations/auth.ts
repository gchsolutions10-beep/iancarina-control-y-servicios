import { z } from "zod";

export const inicioSesionSchema = z.object({
  usuario: z
    .string({ error: "Ingresa tu usuario" })
    .trim()
    .min(1, "Ingresa tu usuario")
    .max(50, "Máximo 50 caracteres"),
  clave: z
    .string({ error: "Ingresa tu contraseña" })
    .min(1, "Ingresa tu contraseña")
    .max(100, "Máximo 100 caracteres"),
  // Ruta interna a la que volver después del login (evita redirecciones abiertas).
  siguiente: z
    .string()
    .optional()
    .transform((ruta) => (ruta && ruta.startsWith("/") && !ruta.startsWith("//") ? ruta : undefined)),
});

export type InicioSesionEntrada = z.infer<typeof inicioSesionSchema>;

export type EstadoInicioSesion = {
  error?: string;
  campos?: Partial<Record<"usuario" | "clave", string>>;
  usuario?: string;
};
