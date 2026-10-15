import { z } from "zod";

export const claveNueva = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(100, "Máximo 100 caracteres")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Usa letras y números");

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === "" ? null : v));

const fechaOpcional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha no válida");

export const usuarioSchema = z.object({
  nombre_usuario: z
    .string()
    .trim()
    .min(3, "Mínimo 3 caracteres")
    .max(50, "Máximo 50 caracteres")
    .regex(/^[A-Za-z0-9._-]+$/, "Solo letras, números, punto, guion y guion bajo (sin espacios)"),
  nombre_apellido: z.string().trim().min(3, "Escribe el nombre y apellido").max(100, "Máximo 100 caracteres"),
  cedula: texto(20).refine((v) => v === null || /^[VEJPGvejpg]?-?\d{5,10}$/.test(v), "Cédula no válida (ej.: 12345678 o V-12345678)"),
  cargo: texto(100),
  bloqueado: z.boolean(),
  recibe_alertas: z.boolean(),
  recibe_aprobaciones: z.boolean(),
  globales: z.array(z.string()),
  /** Rol por empresa: «empresa:rol». */
  empresas: z.array(z.object({ empresa: z.string(), rol: z.string(), vigenteHasta: fechaOpcional })),
  excepciones: z.array(z.object({ empresa: z.string(), permiso: z.string(), vigenteHasta: fechaOpcional })),
});

export type DatosUsuario = z.infer<typeof usuarioSchema>;

export const cambioClaveSchema = z
  .object({
    actual: z.string().min(1, "Escribe tu clave actual"),
    nueva: claveNueva,
    confirmacion: z.string(),
  })
  .refine((d) => d.nueva === d.confirmacion, { path: ["confirmacion"], message: "No coincide con la nueva clave" })
  .refine((d) => d.nueva !== d.actual, { path: ["nueva"], message: "Debe ser distinta de la actual" });
