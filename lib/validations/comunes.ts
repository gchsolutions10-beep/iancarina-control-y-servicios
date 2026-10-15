import { z } from "zod";

/** Campo de texto opcional de un FormData: "" → null. */
export const textoOpcional = (max = 255) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .catch(null);

export const fechaISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida");

export const fechaOpcional = z
  .string()
  .transform((v) => (v === "" ? null : v))
  .pipe(fechaISO.nullable());

/** Número escrito con coma o punto decimal: "12,5" → 12.5; "" → null. */
export const numeroOpcional = (opciones: { min?: number; max?: number; entero?: boolean } = {}) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: "custom", message: "Número no válido" });
        return z.NEVER;
      }
      if (opciones.entero && !Number.isInteger(n)) {
        ctx.addIssue({ code: "custom", message: "Debe ser un número entero" });
        return z.NEVER;
      }
      if (opciones.min !== undefined && n < opciones.min) {
        ctx.addIssue({ code: "custom", message: `Mínimo ${opciones.min}` });
        return z.NEVER;
      }
      if (opciones.max !== undefined && n > opciones.max) {
        ctx.addIssue({ code: "custom", message: `Máximo ${opciones.max}` });
        return z.NEVER;
      }
      return n;
    });

/** Porcentaje escrito como 0–100 y guardado como fracción (12 % → 0.12), igual que Access. */
export const porcentajeOpcional = numeroOpcional({ min: 0, max: 100 }).transform((v) =>
  v === null ? null : Math.round(v * 100) / 10_000,
);

export const idOpcional = z
  .string()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().positive().nullable());

/** Convierte un FormData en objeto de strings (los campos ausentes quedan "" ). */
export function leerFormulario<T extends string>(formData: FormData, campos: readonly T[]): Record<T, string> {
  return Object.fromEntries(campos.map((c) => [c, String(formData.get(c) ?? "")])) as Record<T, string>;
}

export type ErroresCampos = Record<string, string | undefined>;

export function erroresDeZod(error: z.ZodError): ErroresCampos {
  const errores: ErroresCampos = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "general");
    errores[campo] ??= issue.message;
  }
  return errores;
}
