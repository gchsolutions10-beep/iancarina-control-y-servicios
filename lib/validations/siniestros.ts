import { z } from "zod";
import { fechaISO, fechaOpcional, numeroOpcional, textoOpcional } from "./comunes";

/** Validaciones de siniestros (Etapa 4). */

const idTexto = (mensaje: string) => z.string().regex(/^\d+$/, mensaje).transform((v) => BigInt(v));
const idOpcional = z.string().transform((v, ctx) => {
  if (v === "") return null;
  if (!/^\d+$/.test(v)) {
    ctx.addIssue({ code: "custom", message: "No válido" });
    return z.NEVER;
  }
  return BigInt(v);
});
const importe = (mensaje: string) =>
  numeroOpcional({ min: 0 })
    .refine((v) => v !== null, mensaje)
    .transform((v) => v!.toFixed(2));
const importeOpcional = numeroOpcional({ min: 0 }).transform((v) => (v === null ? null : v.toFixed(2)));

export const siniestroSchema = z
  .object({
    id_tipo: z.string().regex(/^\d+$/, "Elige el tipo").transform(Number),
    fecha_evento: fechaISO,
    fecha_notificacion: fechaISO,
    lugar: textoOpcional(200),
    descripcion: z.string().trim().min(5, "Describe lo ocurrido").max(4000),
    tipo_perdida: z.enum(["", "parcial", "total"]).transform((v) => v || null),
    moneda: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Moneda de 3 letras"),
    numero_aseguradora: textoOpcional(40),
  })
  .refine((d) => d.fecha_notificacion >= d.fecha_evento, { path: ["fecha_notificacion"], message: "No puede ser anterior al evento" });

/** Afectado: ficha + (opcional) la póliza y cobertura con que responde, como «idInclusion:idCobertura». */
export const afectadoSchema = z.object({
  id_sujeto: idTexto("Elige el afectado"),
  cobertura: z
    .string()
    .transform((v, ctx) => {
      if (v === "") return null;
      const m = /^(\d+):(\d+)$/.exec(v);
      if (!m) {
        ctx.addIssue({ code: "custom", message: "No válida" });
        return z.NEVER;
      }
      return { id_inclusion: BigInt(m[1]), id_cobertura: Number(m[2]) };
    }),
  danos: textoOpcional(2000),
});

export const transporteSchema = z.object({
  id_transportista: idTexto("Elige el transportista"),
  id_vehiculo: idOpcional,
  placa_texto: textoOpcional(15),
  mercancia: z.string().trim().min(3, "Describe la mercancía").max(1000),
  guia: textoOpcional(60),
  valor_mercancia: importeOpcional,
  perdida: importeOpcional,
});

export const importeSchema = z.object({
  tipo: z.enum(["presupuestado", "autorizado", "reconocido"], { message: "Elige el tipo" }),
  monto: importe("Escribe el monto"),
  fecha: fechaISO,
  referencia: textoOpcional(80),
  motivo: textoOpcional(1000),
});

export const etapaSchema = z.object({
  fecha: fechaISO,
  observaciones: textoOpcional(1000),
});

export const actuacionSchema = z.object({
  fecha: fechaISO,
  descripcion: z.string().trim().min(3, "Describe la actuación").max(4000),
});

export const cobroSchema = z.object({
  id_contraparte: idTexto("Elige quién debe pagar"),
  monto: importe("Escribe el monto"),
  fecha_vencimiento: fechaISO,
  documento: textoOpcional(60),
});

export const cierreSchema = z.object({
  fecha: fechaISO,
  motivo: z.string().trim().min(3, "Indica el motivo").max(1000),
});

export const limiteSchema = z.object({
  tipo: z.enum(["agregado_anual", "por_bien"], { message: "Elige el tipo" }),
  id_cobertura: z.string().transform((v) => (v === "" ? null : Number(v))),
  monto: importe("Escribe el monto"),
  consume: z.enum(["reconocido", "autorizado"]),
  descripcion: textoOpcional(300),
});

export const datosSiniestroSchema = z.object({
  numero_aseguradora: textoOpcional(40),
  lugar: textoOpcional(200),
  descripcion: z.string().trim().min(5, "Describe lo ocurrido").max(4000),
  tipo_perdida: z.enum(["", "parcial", "total"]).transform((v) => v || null),
  fecha_notificacion: fechaOpcional,
});
