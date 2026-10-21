import "server-only";
import { registrarGestion } from "@/lib/auditoria";
import { guardarArchivoInterno } from "@/lib/archivos/almacen";
import { db } from "@/lib/db";
import { sumarAnios, sumarDiasISO } from "@/lib/dominio/vigencias";
import { variable } from "@/lib/entorno";
import type { Prisma } from "@/lib/generated/prisma/client";
import { recalcularPeriodo } from "@/lib/polizas/calcular";
import { sujetoValido } from "@/lib/polizas/edicion";
import { altaTx, bajaTx, confirmarPeriodoTx, INCLUIR_BAJA } from "@/lib/polizas/operaciones";
import type { TipoImporte } from "@/lib/dominio/siniestros";
import { avanzarEtapaTx, crearSiniestroTx, generarCobroTx, registrarImporteTx, type NuevoSiniestro } from "@/lib/siniestros/operaciones";
import { hoyPlanta } from "@/lib/tiempo";
import { IMAGENES_EJEMPLO, type ImagenEjemplo } from "./imagenes";

/**
 * Datos de EJEMPLO para presentar el sistema (Base de datos → Datos de ejemplo). Todo es sintético:
 * identificaciones V-90.xxx.xxx / J-90.xxx.xxx, organizaciones con «(DEMO)», observaciones «Registro
 * de ejemplo (DEMO)» y fotos ilustrativas marcadas «FOTO DE EJEMPLO». Las primas se calculan con las
 * mismas reglas y funciones que usan las pantallas; las tasas son solo de demostración.
 * Fechas relativas a hoy: siempre hay pólizas vigentes, por vencer, vencidas y en preparación.
 */

type Tx = Prisma.TransactionClient;
const fecha = (v: string) => new Date(`${v}T00:00:00Z`);
const NOTA = "Registro de ejemplo (DEMO)";
const IDENT_CONTROL = "90000001";

/** Solo en la demo o en desarrollo: nunca en la base del cliente. */
export function ejemplosPermitidos() {
  return variable("PREPARAR_DEMO") === "true" || process.env.NODE_ENV !== "production";
}

const NOMBRES = [
  ["María José", "Rodríguez"], ["Carlos Eduardo", "Pérez"], ["Ana Lucía", "González"], ["José Gregorio", "Hernández"], ["Daniela", "Martínez"],
  ["Luis Alberto", "García"], ["Andreína", "López"], ["Pedro Rafael", "Díaz"], ["Gabriela", "Sánchez"], ["Jesús Manuel", "Ramírez"],
  ["Valentina", "Torres"], ["Miguel Ángel", "Flores"], ["Carolina", "Rojas"], ["Ricardo", "Medina"], ["Patricia", "Castillo"],
  ["Francisco", "Moreno"], ["Isabel", "Gutiérrez"], ["Héctor", "Romero"], ["Mariana", "Suárez"], ["Oscar", "Herrera"],
  ["Paola", "Vargas"], ["Alejandro", "Mendoza"], ["Rosa Elena", "Silva"], ["Fernando", "Castro"], ["Laura", "Ortega"],
  ["Diego", "Blanco"], ["Verónica", "Rivas"], ["Manuel", "Salazar"], ["Elena", "Paredes"], ["Jorge Luis", "Contreras"],
] as const;

const MODELOS: Record<string, string[]> = { TOYOTA: ["HILUX", "COROLLA", "FORTUNER"], FORD: ["F-350", "EXPLORER", "CARGO 1721"], CHEVROLET: ["SILVERADO", "AVEO", "NPR"], MACK: ["GRANITE"], IVECO: ["TRAKKER"] };

type PlanVehiculo = { tipo: string; marca: string; modelo: string; color: string; imagen: ImagenEjemplo; tm?: number; valor: number; aditamentos?: number };
const FLOTA: PlanVehiculo[] = [
  ...Array.from({ length: 8 }, (_, i): PlanVehiculo => ({ tipo: "Camioneta", marca: "TOYOTA", modelo: i % 2 ? "FORTUNER" : "HILUX", color: ["Blanco", "Negro", "Rojo"][i % 3], imagen: (["camioneta-blanca", "camioneta-negra", "camioneta-roja"] as const)[i % 3], valor: 32000 + i * 1500, aditamentos: i === 2 ? 18000 : undefined })),
  ...Array.from({ length: 6 }, (_, i): PlanVehiculo => ({ tipo: "Automóvil", marca: i % 2 ? "CHEVROLET" : "TOYOTA", modelo: i % 2 ? "AVEO" : "COROLLA", color: i % 2 ? "Gris" : "Blanco", imagen: i % 2 ? "automovil-gris" : "automovil-blanco", valor: 18000 + i * 900 })),
  ...Array.from({ length: 6 }, (_, i): PlanVehiculo => ({ tipo: "Camioneta", marca: "FORD", modelo: "EXPLORER", color: "Negro", imagen: "camioneta-negra", valor: 41000 + i * 800 })),
  ...Array.from({ length: 7 }, (_, i): PlanVehiculo => ({ tipo: "Camión", marca: i % 2 ? "CHEVROLET" : "FORD", modelo: i % 2 ? "NPR" : "CARGO 1721", color: i % 2 ? "Azul" : "Blanco", imagen: i % 2 ? "camion-azul" : "camion-blanco", tm: i % 3 === 0 ? 18 : 8, valor: 55000 + i * 2500 })),
  ...Array.from({ length: 5 }, (_, i): PlanVehiculo => ({ tipo: "Chuto", marca: i % 2 ? "IVECO" : "MACK", modelo: i % 2 ? "TRAKKER" : "GRANITE", color: i % 2 ? "Blanco" : "Rojo", imagen: i % 2 ? "chuto-blanco" : "chuto-rojo", tm: 30, valor: 95000 + i * 4000 })),
];

const PROPIEDADES = [
  { nombre: "Sede administrativa (DEMO)", tipo: "Edificio", imagen: "edificio", valor: 850000, direccion: "Av. Principal, Zona Industrial (ejemplo)" },
  { nombre: "Galpón de almacenamiento A (DEMO)", tipo: "Galpón", imagen: "galpon", valor: 420000, direccion: "Zona Industrial, parcela 12 (ejemplo)" },
  { nombre: "Galpón de almacenamiento B (DEMO)", tipo: "Galpón", imagen: "galpon", valor: 380000, direccion: "Zona Industrial, parcela 14 (ejemplo)" },
  { nombre: "Oficina comercial centro (DEMO)", tipo: "Oficina", imagen: "edificio", valor: 210000, direccion: "Centro, torre de ejemplo, piso 5" },
  { nombre: "Casa de huéspedes (DEMO)", tipo: "Casa", imagen: "casa", valor: 160000, direccion: "Urbanización de ejemplo, calle 3" },
  { nombre: "Centro de distribución oriente (DEMO)", tipo: "Galpón", imagen: "galpon", valor: 510000, direccion: "Carretera nacional, km 8 (ejemplo)" },
] as const;

/** PDF mínimo de una página con texto (cuadro de póliza de ejemplo). */
function pdfEjemplo(lineas: string[]) {
  const esc = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[()\\]/g, (c) => `\\${c}`);
  const texto = lineas.map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 60 ${770 - i * 22} Td (${esc(l)}) Tj ET`).join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(texto)} >>\nstream\n${texto}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

export type ResumenCarga = { personas: number; organizaciones: number; vehiculos: number; propiedades: number; polizas: number; periodos: number; asegurados: number; endosos: number; pagos: number; archivos: number; siniestros: number };

export async function cargarEjemplos(empresa: string, usuario: number): Promise<ResumenCarga> {
  if (!ejemplosPermitidos()) throw new Error("Los datos de ejemplo solo se cargan en la demo.");
  const existe = await db.partes.findFirst({ where: { empresa, identificacion_normalizada: `V${IDENT_CONTROL}` } });
  if (existe) throw new Error("Esta empresa ya tiene los datos de ejemplo. Límpialos primero si quieres volver a cargarlos.");
  const hoy = hoyPlanta();
  const r: ResumenCarga = { personas: 0, organizaciones: 0, vehiculos: 0, propiedades: 0, polizas: 0, periodos: 0, asegurados: 0, endosos: 0, pagos: 0, archivos: 0, siniestros: 0 };

  // ---------------------------------------------------------------- archivos (fuera de la transacción)
  const fotos = {} as Record<ImagenEjemplo, string>;
  for (const [nombre, base64] of Object.entries(IMAGENES_EJEMPLO) as [ImagenEjemplo, string][]) {
    const g = await guardarArchivoInterno(Buffer.from(base64, "base64"), `${nombre} (ejemplo).png`, { empresa, usuario, soloImagen: true });
    if (!g.ok) throw new Error(g.error);
    fotos[nombre] = g.id;
    r.archivos++;
  }

  // ---------------------------------------------------------------- catálogos que usan los ejemplos
  for (const [marca, modelos] of Object.entries(MODELOS)) {
    const m = await db.marcas.upsert({ where: { nombre: marca }, update: {}, create: { nombre: marca } });
    for (const modelo of modelos) await db.modelos.upsert({ where: { id_marca_nombre: { id_marca: m.id, nombre: modelo } }, update: {}, create: { id_marca: m.id, nombre: modelo } });
  }
  await db.catalogo_valores.createMany({ data: ["Blanco", "Negro", "Gris", "Rojo", "Azul"].map((nombre, orden) => ({ lista: "color", nombre, orden })), skipDuplicates: true });
  await db.catalogo_valores.createMany({ data: ["Liviano", "Pesado"].map((nombre, orden) => ({ lista: "clasificacion_chuto", nombre, orden })), skipDuplicates: true });
  const ramoPersonas = await db.ramos.upsert({ where: { nombre: "Accidentes personales (DEMO)" }, update: {}, create: { nombre: "Accidentes personales (DEMO)", sujeto: "persona" } });
  const ramoPropiedades = await db.ramos.upsert({ where: { nombre: "Incendio y líneas aliadas (DEMO)" }, update: {}, create: { nombre: "Incendio y líneas aliadas (DEMO)", sujeto: "propiedad" } });
  for (const [ramo, nombres] of [[ramoPersonas.id, ["Muerte accidental (DEMO)", "Gastos médicos por accidente (DEMO)"]], [ramoPropiedades.id, ["Incendio (DEMO)", "Terremoto (DEMO)"]]] as const) {
    for (const [orden, nombre] of nombres.entries()) await db.coberturas.upsert({ where: { id_ramo_nombre: { id_ramo: ramo, nombre } }, update: {}, create: { id_ramo: ramo, nombre, orden } });
  }
  const ramoAuto = await db.ramos.findUniqueOrThrow({ where: { nombre: "Automóvil (flota)" }, include: { coberturas: true } });
  const cob = (ramo: number) => db.coberturas.findMany({ where: { id_ramo: ramo, activo: true }, orderBy: { orden: "asc" } });
  const [cobAuto, cobPersonas, cobPropiedades] = await Promise.all([cob(ramoAuto.id), cob(ramoPersonas.id), cob(ramoPropiedades.id)]);
  const modelo = async (marca: string, nombre: string) => (await db.modelos.findFirstOrThrow({ where: { nombre, marcas: { nombre: marca } } })).id;

  // ---------------------------------------------------------------- personas, organizaciones y activos
  const fichas = await db.$transaction(
    async (tx) => {
      const juridica = (n: number, razon: string, funciones: string[]) =>
        tx.partes.create({ data: { empresa, tipo: "juridica", tipo_identificacion: "J", numero_identificacion: `90${String(n).padStart(6, "0")}-0`, razon_social: razon, funciones, observaciones: NOTA, creado_por: usuario } });
      const tomador = await juridica(1, "MARY IANCARINA, C.A. (DEMO)", []);
      const aseguradoras = [
        await juridica(2, "SEGUROS ATLÁNTICO, C.A. (DEMO)", ["Aseguradora"]),
        await juridica(3, "MERIDIONAL SEGUROS, S.A. (DEMO)", ["Aseguradora"]),
        await juridica(4, "PROTECCIÓN TOTAL SEGUROS (DEMO)", ["Aseguradora"]),
      ];
      const corredor = await juridica(5, "CORRETAJE ANDINO, C.A. (DEMO)", ["Corredor"]);
      await juridica(6, "TALLER AUTOMOTRIZ CENTRAL (DEMO)", ["Taller"]);
      const transportista = await juridica(7, "TRANSPORTE RÁPIDO DEL SUR (DEMO)", ["Transportista"]);
      r.organizaciones = 7;

      const personas = [];
      for (const [i, [nombres, apellidos]] of NOMBRES.entries()) {
        personas.push(
          await tx.partes.create({
            data: {
              empresa, tipo: "natural", tipo_identificacion: "V", numero_identificacion: `${90000001 + i}`, nombres: nombres.toUpperCase(), apellidos: apellidos.toUpperCase(),
              fecha_nacimiento: fecha(`${1965 + (i % 30)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`),
              telefono: `0414-000-${String(1000 + i).padStart(4, "0")}`, correo: `persona${i + 1}@ejemplo.com`, observaciones: NOTA, creado_por: usuario,
            },
          }),
        );
      }
      // Un duplicado a propósito (para mostrar Personas duplicadas): misma cédula con otra letra y un
      // apellido mal escrito; trae la dirección que a la ficha original le falta.
      const original = personas[4];
      await tx.partes.create({
        data: {
          empresa, tipo: "natural", tipo_identificacion: "E", numero_identificacion: `${90000001 + 4}`, nombres: original.nombres,
          apellidos: `${original.apellidos!.slice(0, -1)}S`, direccion: "Av. Principal, Maracay (DEMO)", observaciones: `${NOTA} Duplicado de ejemplo.`, creado_por: usuario,
        },
      });
      r.personas = personas.length + 1;

      const vehiculos = [];
      for (const [i, v] of FLOTA.entries()) {
        const placa = `D${String(i + 1).padStart(2, "0")}${["AB", "CD", "EF", "GH"][i % 4]}${(i % 9) + 1}M`;
        const veh = await tx.vehiculos.create({
          data: {
            empresa, origen: "propio", placa, id_modelo: await modelo(v.marca, v.modelo), anio: 2016 + (i % 9), tm: v.tm ?? null, color: v.color, tipo_vehiculo: v.tipo,
            clasificacion_chuto: v.tipo === "Chuto" ? "Pesado" : null, tiene_batea: v.tipo === "Chuto", fecha_adquisicion: fecha(`${2016 + (i % 9)}-03-15`), observaciones: NOTA,
            id_foto: fotos[v.imagen], creado_por: usuario,
          },
        });
        await tx.documentos.create({ data: { empresa, id_archivo: fotos[v.imagen], tipo_documento: "Fotografía", descripcion: "Foto de ejemplo", id_vehiculo: veh.id, creado_por: usuario } });
        await tx.titularidades.create({ data: { empresa, id_vehiculo: veh.id, rol: "propietario_legal", id_parte: tomador.id, desde: veh.fecha_adquisicion!, creado_por: usuario } });
        await tx.titularidades.create({ data: { empresa, id_vehiculo: veh.id, rol: "responsable_administrativo", id_parte: personas[i % personas.length].id, desde: veh.fecha_adquisicion!, creado_por: usuario } });
        vehiculos.push({ ...veh, plan: v });
      }
      r.vehiculos = vehiculos.length;

      const propiedades = [];
      for (const p of PROPIEDADES) {
        const prop = await tx.propiedades.create({
          data: { empresa, nombre: p.nombre, tipo_inmueble: p.tipo, direccion: p.direccion, valor_declarado: p.valor.toFixed(2), moneda: "USD", observaciones: NOTA, id_foto: fotos[p.imagen], creado_por: usuario },
        });
        await tx.documentos.create({ data: { empresa, id_archivo: fotos[p.imagen], tipo_documento: "Fotografía", descripcion: "Foto de ejemplo", id_propiedad: prop.id, creado_por: usuario } });
        await tx.titularidades.create({ data: { empresa, id_propiedad: prop.id, rol: "propietario_legal", id_parte: tomador.id, desde: fecha("2015-01-01"), creado_por: usuario } });
        propiedades.push(prop);
      }
      r.propiedades = propiedades.length;
      await registrarGestion(usuario, "DATOS DE EJEMPLO", `Cargados: ${r.personas} personas, ${r.organizaciones} organizaciones, ${r.vehiculos} vehículos, ${r.propiedades} propiedades`, tx, { empresa, operacion: "EJEMPLOS" });
      return { tomador, aseguradoras, corredor, transportista, personas, vehiculos, propiedades };
    },
    { timeout: 120_000 },
  );

  // ---------------------------------------------------------------- pólizas
  type Asegurado = { columna: "id_vehiculo" | "id_persona" | "id_propiedad"; id: bigint; clase?: string | null; valor?: number; aditamentos?: number; suma?: number; ceco: string; certificado: string };
  type Tarifa = { cobertura: number; clase?: string; tasa?: number; prima_fija?: number };

  /** Crea un período en preparación con partes, tarifas, asegurados y coberturas, y lo calcula. */
  const periodo = async (tx: Tx, o: { id_poliza: bigint; numero: number; desde: string; anterior?: bigint; aseguradora: bigint; tarifas: Tarifa[]; asegurados: Asegurado[]; coberturas: number[]; beneficiarios?: boolean }) => {
    const per = await tx.poliza_periodos.create({
      data: { empresa, id_poliza: o.id_poliza, numero_periodo: o.numero, vigencia_desde: fecha(o.desde), vigencia_hasta: fecha(sumarAnios(o.desde)), moneda: "USD", id_periodo_anterior: o.anterior ?? null, creado_por: usuario },
    });
    await tx.periodo_partes.createMany({
      data: [
        { empresa, id_periodo: per.id, rol: "tomador", id_parte: fichas.tomador.id, desde: per.vigencia_desde, creado_por: usuario },
        { empresa, id_periodo: per.id, rol: "corredor", id_parte: fichas.corredor.id, desde: per.vigencia_desde, creado_por: usuario },
      ],
    });
    await tx.periodo_tarifas.createMany({
      data: o.tarifas.map((t) => ({ empresa, id_periodo: per.id, id_cobertura: t.cobertura, clase: t.clase ?? null, tasa: t.tasa?.toString() ?? null, prima_fija: t.prima_fija?.toFixed(2) ?? null, creado_por: usuario })),
    });
    for (const a of o.asegurados) {
      const inc = await tx.inclusiones.create({
        data: {
          empresa, id_periodo: per.id, [a.columna]: a.id, certificado: a.certificado, ceco: a.ceco, clase_tarifa: a.clase ?? null, desde: per.vigencia_desde, hasta: per.vigencia_hasta,
          valor_bien: a.valor?.toFixed(2) ?? null, aditamentos: a.aditamentos?.toFixed(2) ?? null, suma_asegurada: a.suma?.toFixed(2) ?? null, observaciones: NOTA, creado_por: usuario,
        },
      });
      await tx.inclusion_coberturas.createMany({ data: o.coberturas.map((c) => ({ empresa, id_inclusion: inc.id, id_cobertura: c, creado_por: usuario })) });
      if (o.beneficiarios && a.columna === "id_persona") {
        const otra = fichas.personas[(fichas.personas.findIndex((p) => p.id === a.id) + 7) % fichas.personas.length];
        await tx.beneficiarios.create({ data: { empresa, id_inclusion: inc.id, id_parte: otra.id, parentesco: "Familiar", porcentaje: "100", desde: per.vigencia_desde, creado_por: usuario } });
      }
      r.asegurados++;
    }
    await recalcularPeriodo(tx, per.id, usuario);
    r.periodos++;
    return tx.poliza_periodos.findUniqueOrThrow({ where: { id: per.id }, include: { polizas: true } });
  };
  const poliza = (tx: Tx, numero: string, aseguradora: bigint, ramo: number, descripcion: string) =>
    tx.polizas.create({ data: { empresa, numero, id_aseguradora: aseguradora, id_ramo: ramo, descripcion: `${descripcion} — ${NOTA}`, creado_por: usuario } });
  /** Pago imputado a la obligación de prima del período (parcial si `fraccion` < 1). */
  const pagar = async (tx: Tx, idPeriodo: bigint, fraccion: number, fechaPago: string, referencia: string) => {
    const o = await tx.obligaciones.findFirstOrThrow({ where: { id_periodo: idPeriodo, concepto: "prima" }, include: { obligacion_movimientos: true } });
    const monto = (Number(o.obligacion_movimientos[0].monto) * fraccion).toFixed(2);
    const p = await tx.pagos.create({ data: { empresa, sentido: "egreso", fecha: fecha(fechaPago), monto, moneda: o.moneda, referencia, id_contraparte: o.id_contraparte, observaciones: NOTA, creado_por: usuario } });
    await tx.imputaciones.create({ data: { empresa, id_pago: p.id, id_obligacion: o.id, monto, fecha: fecha(fechaPago), creado_por: usuario } });
    await registrarGestion(usuario, "FINANZAS", `OBLIGACIÓN ${o.id} | PAGO ${monto} ${o.moneda} el ${fechaPago} ref. ${referencia} [pago ${p.id}] (ejemplo)`, tx, { empresa, entidad: "obligaciones", idRegistro: o.id, operacion: "PAGO" });
    r.pagos++;
  };
  const c = (lista: { id: number; nombre: string }[], nombre: string) => lista.find((x) => x.nombre.startsWith(nombre))!.id;
  const tarifasAuto = (factor: number): Tarifa[] => [
    { cobertura: c(cobAuto, "Casco"), tasa: +(2.5 * factor).toFixed(4) },
    { cobertura: c(cobAuto, "RCV"), clase: "Automóvil", prima_fija: 95 * factor },
    { cobertura: c(cobAuto, "RCV"), clase: "Camioneta", prima_fija: 120 * factor },
    { cobertura: c(cobAuto, "RCV"), clase: "Camión", prima_fija: 180 * factor },
    { cobertura: c(cobAuto, "RCV"), clase: "Chuto", prima_fija: 260 * factor },
    { cobertura: c(cobAuto, "Exceso"), prima_fija: 35 * factor },
    { cobertura: c(cobAuto, "Defensa"), prima_fija: 20 * factor },
    { cobertura: c(cobAuto, "APOV"), prima_fija: 25 * factor },
    { cobertura: c(cobAuto, "Asistencia"), prima_fija: 12 * factor },
  ];
  const vehiculoAsegurado = (v: (typeof fichas.vehiculos)[number], i: number, ceco: string): Asegurado => ({
    columna: "id_vehiculo", id: v.id, clase: v.plan.tipo, valor: v.plan.valor, aditamentos: v.plan.aditamentos, ceco, certificado: String(i + 1).padStart(3, "0"),
  });
  const livianos = fichas.vehiculos.filter((v) => v.plan.tipo === "Camioneta" || v.plan.tipo === "Automóvil");
  const pesados = fichas.vehiculos.filter((v) => v.plan.tipo === "Camión" || v.plan.tipo === "Chuto");
  const cecos = ["ADM-01", "VEN-02", "OPE-03", "LOG-04"];

  // 1. Flota liviana: período anterior + renovación vigente que vence en 25 días («Por vencer» y «Por renovar»).
  const d0 = sumarDiasISO(hoy, -340);
  const vendidoAntes = livianos[5];
  const p1 = await db.$transaction(
    async (tx) => {
      const pol = await poliza(tx, "AUT-DEMO-0001", fichas.aseguradoras[0].id, ramoAuto.id, "Flota liviana");
      r.polizas++;
      const ant = await periodo(tx, { id_poliza: pol.id, numero: 1, desde: sumarAnios(d0, -1), aseguradora: fichas.aseguradoras[0].id, tarifas: tarifasAuto(1), asegurados: livianos.slice(0, -2).map((v, i) => vehiculoAsegurado(v, i, cecos[i % 3])), coberturas: cobAuto.map((x) => x.id) });
      await confirmarPeriodoTx(tx, ant, usuario, { fecha_vencimiento: sumarDiasISO(sumarAnios(d0, -1), 30), documento: "REC-DEMO-1001" });
      await pagar(tx, ant.id, 1, sumarDiasISO(sumarAnios(d0, -1), 20), "TRF-DEMO-0001");
      // Un vehículo se vendió antes de la renovación: no pasa al período 2.
      await tx.vehiculos.update({ where: { id: vendidoAntes.id }, data: { estado: "vendido", motivo_baja: "venta", fecha_baja: fecha(sumarDiasISO(d0, -20)) } });
      await tx.titularidades.updateMany({ where: { id_vehiculo: vendidoAntes.id, hasta: null }, data: { hasta: fecha(sumarDiasISO(d0, -20)) } });
      const anteriores = await tx.inclusiones.findMany({ where: { id_periodo: ant.id }, select: { id: true, id_vehiculo: true } });
      const nuevo = await periodo(tx, {
        id_poliza: pol.id, numero: 2, desde: d0, anterior: ant.id, aseguradora: fichas.aseguradoras[0].id, tarifas: tarifasAuto(1.08),
        asegurados: livianos.slice(0, -2).filter((v) => v.id !== vendidoAntes.id).map((v, i) => vehiculoAsegurado(v, i, cecos[i % 3])), coberturas: cobAuto.map((x) => x.id),
      });
      for (const a of anteriores) await tx.inclusiones.updateMany({ where: { id_periodo: nuevo.id, id_vehiculo: a.id_vehiculo }, data: { id_inclusion_anterior: a.id } });
      await confirmarPeriodoTx(tx, nuevo, usuario, { fecha_vencimiento: sumarDiasISO(d0, 30), documento: "REC-DEMO-1002" });
      await pagar(tx, nuevo.id, 0.6, sumarDiasISO(d0, 25), "TRF-DEMO-0002");
      return { pol, nuevo };
    },
    { timeout: 180_000 },
  );

  // Endosos en la vigencia actual: alta del penúltimo vehículo y baja por venta de otro.
  await db.$transaction(
    async (tx) => {
      const per = await tx.poliza_periodos.findUniqueOrThrow({ where: { id: p1.nuevo.id }, include: { polizas: true } });
      const altaVeh = livianos[livianos.length - 2];
      const sujeto = (await sujetoValido("vehiculo", altaVeh.id, empresa))!;
      await altaTx(tx, per, usuario, sujeto, { id_sujeto: altaVeh.id, certificado: "100", ceco: "VEN-02", clase_tarifa: null, valor_bien: altaVeh.plan.valor.toFixed(2), aditamentos: null, suma_asegurada: null, observaciones: NOTA }, cobAuto, {
        fecha_efectiva: sumarDiasISO(d0, 90), numero_aseguradora: "END-DEMO-01", importe_aseguradora: null, motivo: null, vencimiento: sumarDiasISO(d0, 120),
      }, false);
      const vendido = livianos[1];
      const inc = await tx.inclusiones.findFirstOrThrow({ where: { id_periodo: per.id, id_vehiculo: vendido.id }, include: INCLUIR_BAJA });
      const fv = sumarDiasISO(d0, 200);
      await bajaTx(tx, per, usuario, inc, { fecha_efectiva: fv, numero_aseguradora: "END-DEMO-02", importe_aseguradora: null, motivo: "Venta del vehículo (ejemplo)", vencimiento: sumarDiasISO(fv, 30) }, false);
      await tx.vehiculos.update({ where: { id: vendido.id }, data: { estado: "vendido", motivo_baja: "venta", fecha_baja: fecha(fv) } });
      await tx.titularidades.updateMany({ where: { id_vehiculo: vendido.id, hasta: null }, data: { hasta: fecha(fv) } });
      r.endosos += 2;
    },
    { timeout: 120_000 },
  );

  // 2. Flota pesada: vigente, pagada completa.
  await db.$transaction(
    async (tx) => {
      const desde = sumarDiasISO(hoy, -90);
      const pol = await poliza(tx, "AUT-DEMO-0002", fichas.aseguradoras[1].id, ramoAuto.id, "Flota pesada (camiones y chutos)");
      r.polizas++;
      const per = await periodo(tx, { id_poliza: pol.id, numero: 1, desde, aseguradora: fichas.aseguradoras[1].id, tarifas: tarifasAuto(1.15), asegurados: pesados.map((v, i) => vehiculoAsegurado(v, i, "LOG-04")), coberturas: cobAuto.map((x) => x.id) });
      await confirmarPeriodoTx(tx, per, usuario, { fecha_vencimiento: sumarDiasISO(desde, 30), documento: "REC-DEMO-2001" });
      await pagar(tx, per.id, 1, sumarDiasISO(desde, 15), "TRF-DEMO-0003");
    },
    { timeout: 180_000 },
  );

  // 3. Accidentes personales: 25 personas con beneficiarios; pago parcial.
  await db.$transaction(
    async (tx) => {
      const desde = sumarDiasISO(hoy, -30);
      const pol = await poliza(tx, "AP-DEMO-0003", fichas.aseguradoras[2].id, ramoPersonas.id, "Accidentes personales del personal");
      r.polizas++;
      const per = await periodo(tx, {
        id_poliza: pol.id, numero: 1, desde, aseguradora: fichas.aseguradoras[2].id, beneficiarios: true,
        tarifas: [{ cobertura: cobPersonas[0].id, tasa: 0.35 }, { cobertura: cobPersonas[1].id, tasa: 0.19 }],
        asegurados: fichas.personas.slice(0, 25).map((p, i) => ({ columna: "id_persona" as const, id: p.id, suma: i % 5 === 0 ? 50000 : 25000, ceco: cecos[i % 4], certificado: String(i + 1).padStart(3, "0") })),
        coberturas: cobPersonas.map((x) => x.id),
      });
      await confirmarPeriodoTx(tx, per, usuario, { fecha_vencimiento: sumarDiasISO(hoy, 10), documento: "REC-DEMO-3001" });
      await pagar(tx, per.id, 0.5, sumarDiasISO(hoy, -5), "TRF-DEMO-0004");
    },
    { timeout: 180_000 },
  );

  // 4. Propiedades: vigente con la prima vencida sin pagar.
  await db.$transaction(
    async (tx) => {
      const desde = sumarDiasISO(hoy, -200);
      const pol = await poliza(tx, "INC-DEMO-0004", fichas.aseguradoras[1].id, ramoPropiedades.id, "Incendio de sedes y galpones");
      r.polizas++;
      const per = await periodo(tx, {
        id_poliza: pol.id, numero: 1, desde, aseguradora: fichas.aseguradoras[1].id,
        tarifas: [{ cobertura: cobPropiedades[0].id, tasa: 0.18 }, { cobertura: cobPropiedades[1].id, tasa: 0.07 }],
        asegurados: fichas.propiedades.map((p, i) => ({ columna: "id_propiedad" as const, id: p.id, valor: Number(p.valor_declarado), suma: Number(p.valor_declarado), ceco: "ADM-01", certificado: String(i + 1).padStart(3, "0") })),
        coberturas: cobPropiedades.map((x) => x.id),
      });
      await confirmarPeriodoTx(tx, per, usuario, { fecha_vencimiento: sumarDiasISO(desde, 30), documento: "REC-DEMO-4001" });
    },
    { timeout: 120_000 },
  );

  // 5. En preparación con una tarifa faltante (muestra el bloqueo con lo que falta).
  await db.$transaction(
    async (tx) => {
      const desde = sumarDiasISO(hoy, 10);
      const pol = await poliza(tx, "AUT-DEMO-0005", fichas.aseguradoras[2].id, ramoAuto.id, "Vehículos de gerencia (en cotización)");
      r.polizas++;
      await periodo(tx, {
        id_poliza: pol.id, numero: 1, desde, aseguradora: fichas.aseguradoras[2].id, tarifas: tarifasAuto(1.1).filter((t) => t.cobertura !== c(cobAuto, "Asistencia")),
        asegurados: livianos.slice(14, 18).map((v, i) => vehiculoAsegurado(v, i, "ADM-01")), coberturas: cobAuto.map((x) => x.id),
      });
    },
    { timeout: 120_000 },
  );

  // ---------------------------------------------------------------- siniestros
  await cargarSiniestros(empresa, usuario, hoy, d0, p1.nuevo.id, fichas, livianos, r);

  // Cuadro de póliza en PDF para las pólizas confirmadas.
  for (const [numero, aseguradora] of [["AUT-DEMO-0001", "SEGUROS ATLANTICO"], ["AUT-DEMO-0002", "MERIDIONAL SEGUROS"], ["AP-DEMO-0003", "PROTECCION TOTAL SEGUROS"], ["INC-DEMO-0004", "MERIDIONAL SEGUROS"]]) {
    const pol = await db.polizas.findFirstOrThrow({ where: { empresa, numero } });
    const g = await guardarArchivoInterno(pdfEjemplo([`Cuadro de poliza ${numero}`, "DOCUMENTO DE EJEMPLO (DEMO) - sin valor contractual", `Aseguradora: ${aseguradora} (DEMO)`, "Tomador: MARY IANCARINA, C.A. (DEMO)", "Generado por el sistema para la presentacion."]), `Cuadro de póliza ${numero} (ejemplo).pdf`, { empresa, usuario });
    if (!g.ok) throw new Error(g.error);
    await db.documentos.create({ data: { empresa, id_archivo: g.id, tipo_documento: "Póliza / cuadro de póliza", descripcion: "Documento de ejemplo", id_poliza: pol.id, creado_por: usuario } });
    r.archivos++;
  }
  return r;
}

type Fichas = { tomador: { id: bigint }; aseguradoras: { id: bigint }[]; transportista: { id: bigint }; personas: { id: bigint; nombres: string | null; apellidos: string | null }[]; propiedades: { id: bigint; nombre: string }[] };

/**
 * Ocho expedientes que muestran cada situación: cerrado y cobrado, en taller, robo sin movimiento,
 * cerca del límite por vehículo, cerrado pendiente de cobro, persona (confidencial), propiedad y
 * transporte contratado con la cuenta por cobrar vencida. Límites de riesgos diversos en la flota.
 */
async function cargarSiniestros(empresa: string, usuario: number, hoy: string, d0: string, idPeriodoFlota: bigint, fichas: Fichas, livianos: { id: bigint; placa: string }[], r: ResumenCarga) {
  const tipos = await db.tipos_siniestro.findMany();
  const tipo = (prefijo: string) => tipos.find((t) => t.nombre.startsWith(prefijo))!.id;
  const periodoDe = async (numero: string) => (await db.poliza_periodos.findFirstOrThrow({ where: { empresa, estado: "confirmado", polizas: { numero } }, orderBy: { numero_periodo: "desc" } })).id;
  const [pAp, pInc] = await Promise.all([periodoDe("AP-DEMO-0003"), periodoDe("INC-DEMO-0004")]);

  /** Póliza y cobertura que responde (la inclusión del sujeto en ese período). */
  const cobertura = async (tx: Tx, idPeriodo: bigint, columna: "id_vehiculo" | "id_persona" | "id_propiedad", id: bigint, prefijo: string) => {
    const inc = await tx.inclusiones.findFirstOrThrow({ where: { id_periodo: idPeriodo, [columna]: id }, include: { inclusion_coberturas: { include: { coberturas: true } } } });
    return { id_inclusion: inc.id, id_cobertura: inc.inclusion_coberturas.find((c) => c.coberturas.nombre.startsWith(prefijo))!.id_cobertura, id_periodo: idPeriodo };
  };
  type Paso = { etapas?: string[]; importes?: [TipoImporte, number, string][]; cobro?: { a: bigint; monto: number; vence: string; cobrado?: number }; cierre?: string; actuaciones?: [string, string][] };
  const expediente = async (d: Omit<NuevoSiniestro, "empresa" | "moneda" | "lugar" | "numero_aseguradora" | "tipo_perdida"> & { lugar: string; numero_aseguradora?: string; tipo_perdida?: string }, p: Paso) =>
    db.$transaction(
      async (tx) => {
        const s = await crearSiniestroTx(tx, usuario, { empresa, moneda: "USD", numero_aseguradora: d.numero_aseguradora ?? null, tipo_perdida: d.tipo_perdida ?? null, ...d });
        // Para que «sin movimiento» refleje las fechas del ejemplo y no el día de la carga.
        await tx.siniestros.update({ where: { id: s.id }, data: { creado_en: fecha(d.fecha_notificacion) } });
        for (const f of p.etapas ?? []) await avanzarEtapaTx(tx, usuario, s.id, f, null);
        for (const [t, monto, f] of p.importes ?? []) await registrarImporteTx(tx, usuario, s.id, { tipo: t, monto: monto.toFixed(2), fecha: f, referencia: null, motivo: null });
        for (const [f, texto] of p.actuaciones ?? []) await tx.siniestro_actuaciones.create({ data: { empresa, id_siniestro: s.id, fecha: fecha(f), descripcion: texto, creado_por: usuario } });
        if (p.cobro) {
          const emision = p.importes?.at(-1)?.[2] ?? hoy;
          const o = await generarCobroTx(tx, usuario, s.id, { id_contraparte: p.cobro.a, monto: p.cobro.monto.toFixed(2), fecha_emision: emision, fecha_vencimiento: p.cobro.vence, documento: "FIN-DEMO" });
          if (p.cobro.cobrado) {
            const monto = p.cobro.cobrado.toFixed(2);
            const pago = await tx.pagos.create({ data: { empresa, sentido: "ingreso", fecha: fecha(p.cobro.vence), monto, moneda: "USD", referencia: "DEP-DEMO", id_contraparte: p.cobro.a, observaciones: NOTA, creado_por: usuario } });
            await tx.imputaciones.create({ data: { empresa, id_pago: pago.id, id_obligacion: o.id, monto, fecha: fecha(p.cobro.vence), creado_por: usuario } });
            r.pagos++;
          }
        }
        if (p.cierre) {
          await tx.siniestro_etapas.updateMany({ where: { id_siniestro: s.id, fecha_fin: null }, data: { fecha_fin: fecha(p.cierre) } });
          await tx.siniestros.update({ where: { id: s.id }, data: { estado: "cerrado", cerrado_en: fecha(p.cierre), motivo_cierre: "Reparación entregada y reembolso reconocido (ejemplo)" } });
        }
        r.siniestros++;
        return s;
      },
      { timeout: 60_000 },
    );
  const v = (i: number) => ({ columna: "id_vehiculo" as const, id: livianos[i].id, nombre: livianos[i].placa });
  const aseguradora = fichas.aseguradoras[0].id;

  // Límites de riesgos diversos de la flota (los del requerimiento, como ejemplo).
  await db.limites.createMany({
    data: [
      { empresa, id_periodo: idPeriodoFlota, tipo: "agregado_anual", monto: "60000.00", consume: "reconocido", descripcion: "Riesgos diversos — límite anual (ejemplo)", creado_por: usuario },
      { empresa, id_periodo: idPeriodoFlota, tipo: "por_bien", monto: "20000.00", consume: "reconocido", descripcion: "Riesgos diversos — por vehículo (ejemplo)", creado_por: usuario },
    ],
  });

  // 1. Choque: flujo completo, reconocido, cobrado y cerrado.
  const f1 = sumarDiasISO(d0, 150);
  const c1 = await db.$transaction((tx) => cobertura(tx, idPeriodoFlota, "id_vehiculo", livianos[0].id, "Casco"));
  await expediente(
      { id_tipo: tipo("Choque"), fecha_evento: f1, fecha_notificacion: sumarDiasISO(f1, 1), lugar: "Autopista regional, km 12 (ejemplo)", numero_aseguradora: "SIN-ASEG-7781", tipo_perdida: "parcial", descripcion: "Colisión trasera en tráfico lento. Daños en parachoques y compuerta. (DEMO)", afectado: { ...v(0), danos: "Parachoques y compuerta trasera", cobertura: c1 } },
      {
        etapas: [sumarDiasISO(f1, 3), sumarDiasISO(f1, 6), sumarDiasISO(f1, 20), sumarDiasISO(f1, 35)],
        importes: [["presupuestado", 4200, sumarDiasISO(f1, 3)], ["autorizado", 3900, sumarDiasISO(f1, 6)], ["reconocido", 3900, sumarDiasISO(f1, 35)]],
        cobro: { a: aseguradora, monto: 3900, vence: sumarDiasISO(f1, 50), cobrado: 3900 },
        cierre: sumarDiasISO(f1, 52),
        actuaciones: [[sumarDiasISO(f1, 2), "Se envió el aviso a la aseguradora con fotos del daño."], [sumarDiasISO(f1, 21), "El taller confirma la llegada de repuestos."]],
      },
  );

  // 2. Choque reciente: en «Entrada a taller», con presupuesto y autorización.
  const f2 = sumarDiasISO(hoy, -12);
  const c2 = await db.$transaction((tx) => cobertura(tx, idPeriodoFlota, "id_vehiculo", livianos[3].id, "Casco"));
  await expediente(
    { id_tipo: tipo("Choque"), fecha_evento: f2, fecha_notificacion: f2, lugar: "Estacionamiento de la sede (ejemplo)", tipo_perdida: "parcial", descripcion: "Golpe lateral al maniobrar. (DEMO)", afectado: { ...v(3), danos: "Puerta delantera izquierda", cobertura: c2 } },
    { etapas: [sumarDiasISO(f2, 2), sumarDiasISO(f2, 5)], importes: [["presupuestado", 2500, sumarDiasISO(f2, 2)], ["autorizado", 2300, sumarDiasISO(f2, 5)]], actuaciones: [[sumarDiasISO(f2, 6), "Vehículo ingresó al taller."]] },
  );

  // 3. Robo sin movimiento desde hace más de un mes.
  const f3 = sumarDiasISO(hoy, -45);
  await expediente({ id_tipo: tipo("Robo"), fecha_evento: f3, fecha_notificacion: sumarDiasISO(f3, 1), lugar: "Zona centro (ejemplo)", tipo_perdida: "total", descripcion: "Hurto del vehículo estacionado. Denuncia en trámite. (DEMO)", afectado: { ...v(4), danos: "Pérdida total por hurto", cobertura: null } }, {});

  // 4. Daño grande: reconocido cerca del límite por vehículo (aviso), cerrado y cobrado en parte.
  const f4 = sumarDiasISO(d0, 210);
  const c4 = await db.$transaction((tx) => cobertura(tx, idPeriodoFlota, "id_vehiculo", livianos[7].id, "Casco"));
  await expediente(
    { id_tipo: tipo("Choque"), fecha_evento: f4, fecha_notificacion: f4, lugar: "Carretera nacional (ejemplo)", tipo_perdida: "parcial", descripcion: "Volcamiento sin lesionados. (DEMO)", afectado: { ...v(7), danos: "Carrocería y tren delantero", cobertura: c4 } },
    {
      etapas: [sumarDiasISO(f4, 2), sumarDiasISO(f4, 4), sumarDiasISO(f4, 30), sumarDiasISO(f4, 45)],
      importes: [["presupuestado", 19000, sumarDiasISO(f4, 2)], ["autorizado", 18000, sumarDiasISO(f4, 4)], ["reconocido", 18000, sumarDiasISO(f4, 45)]],
      cobro: { a: aseguradora, monto: 18000, vence: sumarDiasISO(f4, 60), cobrado: 10000 },
      cierre: sumarDiasISO(f4, 46),
    },
  );

  // 5. En reembolso: reconocido y cuenta por cobrar sin cobrar todavía.
  const f5 = sumarDiasISO(hoy, -70);
  const c5 = await db.$transaction((tx) => cobertura(tx, idPeriodoFlota, "id_vehiculo", livianos[9].id, "Casco"));
  await expediente(
    { id_tipo: tipo("Choque"), fecha_evento: f5, fecha_notificacion: sumarDiasISO(f5, 1), lugar: "Avenida principal (ejemplo)", tipo_perdida: "parcial", descripcion: "Choque en intersección. (DEMO)", afectado: { ...v(9), danos: "Frente y radiador", cobertura: c5 } },
    {
      etapas: [sumarDiasISO(f5, 3), sumarDiasISO(f5, 6), sumarDiasISO(f5, 25), sumarDiasISO(f5, 40)],
      importes: [["presupuestado", 6800, sumarDiasISO(f5, 3)], ["autorizado", 6500, sumarDiasISO(f5, 6)], ["reconocido", 6500, sumarDiasISO(f5, 40)]],
      cobro: { a: aseguradora, monto: 6500, vence: sumarDiasISO(hoy, 10) },
    },
  );

  // 6. Accidente de persona (confidencial) con la póliza de accidentes personales.
  const f6 = sumarDiasISO(hoy, -10);
  const persona = fichas.personas[2];
  const c6 = await db.$transaction((tx) => cobertura(tx, pAp, "id_persona", persona.id, "Gastos"));
  await expediente(
    { id_tipo: tipo("Accidente"), fecha_evento: f6, fecha_notificacion: sumarDiasISO(f6, 2), lugar: "Planta (ejemplo)", descripcion: "Caída en el área de carga; atención médica ambulatoria. (DEMO)", afectado: { columna: "id_persona", id: persona.id, nombre: `${persona.nombres} ${persona.apellidos}`, danos: "Esguince de tobillo", cobertura: c6 } },
    { etapas: [sumarDiasISO(f6, 4)], importes: [["presupuestado", 1800, sumarDiasISO(f6, 4)]] },
  );

  // 7. Daño a una propiedad con la póliza de incendio.
  const f7 = sumarDiasISO(hoy, -14);
  const galpon = fichas.propiedades[1];
  const c7 = await db.$transaction((tx) => cobertura(tx, pInc, "id_propiedad", galpon.id, "Incendio"));
  await expediente(
    { id_tipo: tipo("Daño a la propiedad"), fecha_evento: f7, fecha_notificacion: sumarDiasISO(f7, 1), lugar: galpon.nombre, tipo_perdida: "parcial", descripcion: "Conato de incendio en el tablero eléctrico. (DEMO)", afectado: { columna: "id_propiedad", id: galpon.id, nombre: galpon.nombre, danos: "Tablero eléctrico y techo", cobertura: c7 } },
    { etapas: [sumarDiasISO(f7, 3)], importes: [["presupuestado", 35000, sumarDiasISO(f7, 3)]], actuaciones: [[sumarDiasISO(f7, 10), "Visita del perito de la aseguradora."]] },
  );

  // 8. Transporte contratado: mercancía perdida, cuenta por cobrar al transportista vencida.
  const f8 = sumarDiasISO(hoy, -60);
  await expediente(
    {
      id_tipo: tipo("Pérdida de mercancía"), fecha_evento: f8, fecha_notificacion: sumarDiasISO(f8, 1), lugar: "Ruta oriente (ejemplo)", descripcion: "Pérdida parcial de la carga por lluvia; lona dañada. (DEMO)",
      transporte: { id_transportista: fichas.transportista.id, id_vehiculo: null, placa_texto: "A45BC7D", mercancia: "120 bultos de harina (ejemplo)", guia: "GD-DEMO-4410", valor_mercancia: "15600.00", perdida: "7800.00" },
    },
    { etapas: [sumarDiasISO(f8, 5), sumarDiasISO(f8, 15)], importes: [["reconocido", 7800, sumarDiasISO(f8, 15)]], cobro: { a: fichas.transportista.id, monto: 7800, vence: sumarDiasISO(f8, 30) } },
  );
}
