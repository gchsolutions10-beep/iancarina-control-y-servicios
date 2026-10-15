import { z } from "zod";
import { fechaOpcional, numeroOpcional, textoOpcional } from "./comunes";

/**
 * Validaciones de las fichas de la Etapa 2 (personas, vehículos, propiedades).
 * Compartidas por las acciones; lógica pura probada en tests/fichas.test.ts.
 */

const obligatorio = (etiqueta: string, max = 120) =>
  z.string().trim().min(1, `Escribe ${etiqueta}`).max(max, `Máximo ${max} caracteres`);

const correo = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v.toLowerCase()))
  .refine((v) => v === null || z.email().safeParse(v).success, "Correo no válido");

/** Persona natural o jurídica. Los campos que no aplican al tipo se ignoran. */
export const parteSchema = z
  .object({
    tipo: z.enum(["natural", "juridica"], { message: "Elige el tipo" }),
    tipo_identificacion: z.string().trim().min(1, "Elige el tipo de identificación").max(5),
    numero_identificacion: z
      .string()
      .trim()
      .min(3, "Escribe el número")
      .max(30, "Máximo 30 caracteres")
      .regex(/^[0-9A-Za-z.\- ]+$/, "Solo números, letras, puntos y guiones"),
    nombres: textoOpcional(120),
    apellidos: textoOpcional(120),
    razon_social: textoOpcional(200),
    funciones: z.array(z.string().trim().min(1).max(120)),
    fecha_nacimiento: fechaOpcional,
    telefono: textoOpcional(40),
    correo,
    direccion: textoOpcional(500),
    observaciones: textoOpcional(2000),
  })
  .superRefine((d, ctx) => {
    if (d.tipo === "natural") {
      if (!d.nombres) ctx.addIssue({ code: "custom", path: ["nombres"], message: "Escribe los nombres" });
      if (!d.apellidos) ctx.addIssue({ code: "custom", path: ["apellidos"], message: "Escribe los apellidos" });
    } else if (!d.razon_social) {
      ctx.addIssue({ code: "custom", path: ["razon_social"], message: "Escribe la razón social" });
    }
  })
  .transform((d) =>
    d.tipo === "natural"
      ? { ...d, razon_social: null, funciones: [] as string[] }
      : { ...d, nombres: null, apellidos: null, fecha_nacimiento: null },
  );

export type DatosParte = z.infer<typeof parteSchema>;

/** Igual que cys.normalizar_codigo(): mayúsculas, sin espacios, puntos ni guiones. */
export const normalizarCodigo = (texto: string) => texto.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** Nombre para mostrar de una parte. */
export function nombreParte(p: { tipo: string; nombres: string | null; apellidos: string | null; razon_social: string | null }) {
  return p.tipo === "juridica" ? (p.razon_social ?? "") : `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim();
}

/** Datos personales que solo ve quien tiene «personas.datos_sensibles». */
export const CAMPOS_SENSIBLES = ["fecha_nacimiento", "telefono", "correo", "direccion"] as const;

export function enmascarar<T extends Record<string, unknown>>(parte: T, puedeVer: boolean): T {
  if (puedeVer) return parte;
  const copia: Record<string, unknown> = { ...parte };
  for (const c of CAMPOS_SENSIBLES) if (copia[c] !== null && copia[c] !== undefined) copia[c] = "•••";
  return copia as T;
}

const anioActual = new Date().getFullYear();

export const vehiculoSchema = z.object({
  origen: z.enum(["propio", "tercero"], { message: "Elige si es propio o de terceros" }),
  placa: z
    .string()
    .trim()
    .toUpperCase()
    .min(5, "Placa no válida")
    .max(15, "Máximo 15 caracteres")
    .regex(/^[A-Z0-9 -]+$/, "Solo letras, números y guiones"),
  id_modelo: z
    .string()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || Number.isInteger(v), "Modelo no válido"),
  anio: numeroOpcional({ entero: true, min: 1950, max: anioActual + 1 }),
  tm: textoOpcional(40),
  color: textoOpcional(120),
  tipo_vehiculo: textoOpcional(120),
  clasificacion_chuto: textoOpcional(120),
  tiene_batea: z.boolean(),
  fecha_adquisicion: fechaOpcional,
  observaciones: textoOpcional(2000),
});

export const propiedadSchema = z
  .object({
    nombre: obligatorio("el nombre", 150),
    tipo_inmueble: textoOpcional(120),
    direccion: textoOpcional(500),
    valor_declarado: numeroOpcional({ min: 0 }),
    moneda: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => (v === "" ? null : v))
      .refine((v) => v === null || /^[A-Z]{3}$/.test(v), "Moneda de 3 letras (USD, VES, EUR)"),
    observaciones: textoOpcional(2000),
  })
  .refine((d) => (d.valor_declarado === null) === (d.moneda === null), { path: ["moneda"], message: "Indica valor y moneda juntos" });

export const bajaSchema = z.object({
  motivo_baja: z.enum(["venta", "transferencia", "retiro"], { message: "Elige el motivo" }),
  fecha_baja: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  observaciones: textoOpcional(1000),
});

export const titularSchema = z.object({
  rol: z.enum(["propietario_legal", "responsable_administrativo"], { message: "Elige el rol" }),
  id_parte: z
    .string()
    .regex(/^\d+$/, "Elige la persona o empresa")
    .transform((v) => BigInt(v)),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida"),
  observaciones: textoOpcional(1000),
});

export const ROLES_TITULAR = { propietario_legal: "Propietario legal", responsable_administrativo: "Responsable administrativo" } as const;

/**
 * Fecha en que termina la titularidad vigente al registrar un nuevo titular desde `desde`.
 * Devuelve el día anterior; si el nuevo empieza el mismo día o antes que el vigente, es un error.
 */
export function cierreTitularidad(vigenteDesde: string, nuevoDesde: string): { ok: true; hasta: string } | { ok: false; error: string } {
  if (nuevoDesde <= vigenteDesde) return { ok: false, error: `El nuevo titular debe empezar después del ${vigenteDesde} (inicio del titular actual).` };
  const d = new Date(`${nuevoDesde}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return { ok: true, hasta: d.toISOString().slice(0, 10) };
}
