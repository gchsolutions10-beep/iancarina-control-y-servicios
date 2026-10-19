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

export type ResumenCarga = { personas: number; organizaciones: number; vehiculos: number; propiedades: number; polizas: number; periodos: number; asegurados: number; endosos: number; pagos: number; archivos: number };

export async function cargarEjemplos(empresa: string, usuario: number): Promise<ResumenCarga> {
  if (!ejemplosPermitidos()) throw new Error("Los datos de ejemplo solo se cargan en la demo.");
  const existe = await db.partes.findFirst({ where: { empresa, identificacion_normalizada: `V${IDENT_CONTROL}` } });
  if (existe) throw new Error("Esta empresa ya tiene los datos de ejemplo. Límpialos primero si quieres volver a cargarlos.");
  const hoy = hoyPlanta();
  const r: ResumenCarga = { personas: 0, organizaciones: 0, vehiculos: 0, propiedades: 0, polizas: 0, periodos: 0, asegurados: 0, endosos: 0, pagos: 0, archivos: 0 };

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
      await juridica(7, "TRANSPORTE RÁPIDO DEL SUR (DEMO)", ["Transportista"]);
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
      r.personas = personas.length;

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
      return { tomador, aseguradoras, corredor, personas, vehiculos, propiedades };
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
