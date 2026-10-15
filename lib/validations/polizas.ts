import { z } from "zod";
import { fechaISO, fechaOpcional, numeroOpcional, textoOpcional } from "./comunes";

/** Validaciones de pólizas, endosos, renovaciones y primas (Etapa 3). */

const id = (mensaje: string) => z.string().regex(/^\d+$/, mensaje).transform((v) => BigInt(v));
const moneda = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Moneda de 3 letras (USD, VES, EUR)");
/** Importe opcional ≥ 0, como texto decimal exacto con 2 decimales. */
const importeOpcional = numeroOpcional({ min: 0 }).transform((v) => (v === null ? null : v.toFixed(2)));

export const polizaSchema = z
  .object({
    id_aseguradora: id("Elige la aseguradora"),
    numero: z.string().trim().min(1, "Escribe el número").max(40, "Máximo 40 caracteres"),
    id_ramo: z.string().regex(/^\d+$/, "Elige el ramo").transform(Number),
    descripcion: textoOpcional(1000),
    moneda,
    vigencia_desde: fechaISO,
    vigencia_hasta: fechaOpcional,
    id_tomador: id("Elige el tomador"),
  })
  .refine((d) => d.vigencia_hasta === null || d.vigencia_hasta > d.vigencia_desde, { path: ["vigencia_hasta"], message: "Debe ser posterior al inicio" });

export const parteSchema = z.object({
  rol: z.enum(["tomador", "contratante", "pagador", "corredor"], { message: "Elige el rol" }),
  id_parte: id("Elige la persona o empresa"),
});

export const tarifaSchema = z
  .object({
    id_cobertura: z.string().regex(/^\d+$/, "Elige la cobertura").transform(Number),
    clase: textoOpcional(120),
    tasa: numeroOpcional({ min: 0, max: 100 }),
    prima_fija: importeOpcional,
  })
  .refine((d) => d.tasa !== null || d.prima_fija !== null, { path: ["tasa"], message: "Indica la tasa, la prima fija o ambas" });

export const aseguradoSchema = z
  .object({
    id_sujeto: id("Elige el asegurado"),
    certificado: textoOpcional(40),
    ceco: textoOpcional(40),
    clase_tarifa: textoOpcional(120),
    desde: fechaOpcional,
    valor_bien: importeOpcional,
    aditamentos: importeOpcional,
    suma_asegurada: importeOpcional,
    coberturas: z.array(z.string().regex(/^\d+$/).transform(Number)).min(1, "Marca al menos una cobertura"),
    observaciones: textoOpcional(1000),
  });

/** Datos comunes de un endoso confirmado por la aseguradora. */
export const endosoSchema = z
  .object({
    fecha_efectiva: fechaISO,
    numero_aseguradora: textoOpcional(40),
    importe_aseguradora: importeOpcional,
    motivo: textoOpcional(1000),
  })
  .refine((d) => d.importe_aseguradora === null || d.motivo !== null, { path: ["motivo"], message: "Indica por qué se usa el importe de la aseguradora" });

export const primaAseguradoraSchema = z.object({
  prima: numeroOpcional({ min: 0 }).refine((v) => v !== null, "Escribe la prima").transform((v) => v!.toFixed(2)),
  motivo: z.string().trim().min(3, "Indica el motivo (p. ej. «según cuadro de la aseguradora»)").max(500),
});

export const confirmarSchema = z.object({
  fecha_vencimiento: fechaISO,
  documento: textoOpcional(60),
});

export const beneficiarioSchema = z.object({
  id_parte: id("Elige la persona"),
  parentesco: textoOpcional(60),
  porcentaje: numeroOpcional({ min: 0.01, max: 100 }).refine((v) => v !== null, "Indica el porcentaje"),
  fecha: fechaOpcional,
});

export const pagoSchema = z.object({
  fecha: fechaISO,
  monto: numeroOpcional({ min: 0.01 }).refine((v) => v !== null, "Escribe el monto").transform((v) => v!.toFixed(2)),
  referencia: textoOpcional(80),
  observaciones: textoOpcional(1000),
});

export const reglaSchema = z.object({
  expresion: textoOpcional(500),
  base_dias: z.enum(["", "360", "365", "366"]).transform((v) => (v ? Number(v) : null)),
  metodo: z.enum(["", "dias", "solo_aseguradora"]).transform((v) => v || null),
  vigente_desde: fechaISO,
  estado: z.enum(["propuesta", "aprobada"]),
  descripcion: textoOpcional(1000),
});
