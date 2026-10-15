"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { describirCambios, registrarGestion } from "@/lib/auditoria";
import { requerirSesion } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { EstadoAccion } from "@/lib/estado-accion";
import { codigoPg, sinPermiso } from "@/lib/fichas/acceso";
import { hoyPlanta } from "@/lib/tiempo";
import { erroresDeZod } from "@/lib/validations/comunes";
import { bajaSchema, cierreTitularidad, nombreParte, propiedadSchema, ROLES_TITULAR, titularSchema, vehiculoSchema } from "@/lib/validations/fichas";

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "");
const fecha = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Crea o modifica un vehículo. La placa es única entre los vehículos activos de la empresa. */
export async function guardarVehiculo(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const id = Number(texto(fd, "id")) || null;
  const anterior = id ? await db.vehiculos.findUnique({ where: { id: BigInt(id) } }) : null;
  if (id && !anterior) return { error: "El vehículo ya no existe." };
  const empresa = anterior?.empresa ?? texto(fd, "empresa");
  const negado = sinPermiso(usuario, empresa, "seguros.registrar");
  if (negado) return { error: negado };

  const entrada = vehiculoSchema.safeParse({
    origen: texto(fd, "origen"),
    placa: texto(fd, "placa"),
    id_modelo: texto(fd, "id_modelo"),
    anio: texto(fd, "anio"),
    tm: texto(fd, "tm"),
    color: texto(fd, "color"),
    tipo_vehiculo: texto(fd, "tipo_vehiculo"),
    clasificacion_chuto: texto(fd, "clasificacion_chuto"),
    tiene_batea: fd.get("tiene_batea") === "on",
    fecha_adquisicion: texto(fd, "fecha_adquisicion"),
    observaciones: texto(fd, "observaciones"),
  });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  const valores = { ...d, fecha_adquisicion: fecha(d.fecha_adquisicion), actualizado_por: usuario.id, actualizado_en: new Date() };

  let idGuardado: number;
  try {
    idGuardado = await db.$transaction(async (tx) => {
      const v = anterior
        ? await tx.vehiculos.update({ where: { id: anterior.id }, data: valores })
        : await tx.vehiculos.create({ data: { ...valores, empresa, creado_por: usuario.id } });
      const modelos = await tx.modelos.findMany({ where: { id: { in: [anterior?.id_modelo, v.id_modelo].filter((m): m is number => !!m) } }, include: { marcas: true } });
      const modelo = (m: number | null) => {
        const x = modelos.find((y) => y.id === m);
        return x ? `${x.marcas.nombre} ${x.nombre}` : null;
      };
      const comparable = (x: typeof v) => ({
        origen: x.origen, placa: x.placa, modelo: modelo(x.id_modelo), anio: x.anio, tm: x.tm, color: x.color, tipo_vehiculo: x.tipo_vehiculo,
        clasificacion_chuto: x.clasificacion_chuto, tiene_batea: x.tiene_batea, fecha_adquisicion: x.fecha_adquisicion, observaciones: x.observaciones,
      });
      const cambios = describirCambios(Number(v.id), anterior ? comparable(anterior) : null, comparable(v));
      if (cambios) await registrarGestion(usuario.id, "VEHICULOS", cambios, tx, { empresa, entidad: "vehiculos", idRegistro: v.id, operacion: anterior ? "MODIFICAR" : "CREAR" });
      return Number(v.id);
    });
  } catch (error) {
    if (codigoPg(error) === "23505") return { error: "Ya hay un vehículo activo con esa placa en esta empresa.", errores: { placa: "Placa ya registrada" } };
    console.error("[guardarVehiculo]", error);
    return { error: "No se pudo guardar. Intenta de nuevo." };
  }
  revalidatePath("/activos/vehiculos");
  if (!id) redirect(`/activos/vehiculos/${idGuardado}?creado=1`);
  revalidatePath(`/activos/vehiculos/${idGuardado}`);
  return { ok: true, mensaje: "Cambios guardados." };
}

/** Crea o modifica una propiedad. */
export async function guardarPropiedad(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const id = Number(texto(fd, "id")) || null;
  const anterior = id ? await db.propiedades.findUnique({ where: { id: BigInt(id) } }) : null;
  if (id && !anterior) return { error: "La propiedad ya no existe." };
  const empresa = anterior?.empresa ?? texto(fd, "empresa");
  const negado = sinPermiso(usuario, empresa, "seguros.registrar");
  if (negado) return { error: negado };

  const entrada = propiedadSchema.safeParse({
    nombre: texto(fd, "nombre"),
    tipo_inmueble: texto(fd, "tipo_inmueble"),
    direccion: texto(fd, "direccion"),
    valor_declarado: texto(fd, "valor_declarado"),
    moneda: texto(fd, "moneda"),
    observaciones: texto(fd, "observaciones"),
  });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const valores = { ...entrada.data, actualizado_por: usuario.id, actualizado_en: new Date() };

  const idGuardado = await db.$transaction(async (tx) => {
    const p = anterior
      ? await tx.propiedades.update({ where: { id: anterior.id }, data: valores })
      : await tx.propiedades.create({ data: { ...valores, empresa, creado_por: usuario.id } });
    const comparable = (x: typeof p) => ({
      nombre: x.nombre, tipo_inmueble: x.tipo_inmueble, direccion: x.direccion,
      valor_declarado: x.valor_declarado?.toString() ?? null, moneda: x.moneda, observaciones: x.observaciones,
    });
    const cambios = describirCambios(Number(p.id), anterior ? comparable(anterior) : null, comparable(p));
    if (cambios) await registrarGestion(usuario.id, "PROPIEDADES", cambios, tx, { empresa, entidad: "propiedades", idRegistro: p.id, operacion: anterior ? "MODIFICAR" : "CREAR" });
    return Number(p.id);
  });
  revalidatePath("/activos/propiedades");
  if (!id) redirect(`/activos/propiedades/${idGuardado}?creada=1`);
  revalidatePath(`/activos/propiedades/${idGuardado}`);
  return { ok: true, mensaje: "Cambios guardados." };
}

type TipoActivo = "vehiculo" | "propiedad";
const esTipo = (v: string): v is TipoActivo => v === "vehiculo" || v === "propiedad";
const ruta = (t: TipoActivo, id: number) => `/activos/${t === "vehiculo" ? "vehiculos" : "propiedades"}/${id}`;

async function cargarActivo(tipo: TipoActivo, id: number) {
  return tipo === "vehiculo"
    ? db.vehiculos.findUnique({ where: { id: BigInt(id) }, select: { id: true, empresa: true, estado: true, fecha_adquisicion: true } })
    : db.propiedades.findUnique({ where: { id: BigInt(id) }, select: { id: true, empresa: true, estado: true } });
}

/**
 * Venta, transferencia o retiro. El activo no se borra: queda con su fecha y motivo, deja de ser
 * elegible para futuras renovaciones y sus titularidades abiertas se cierran en esa fecha.
 */
export async function darDeBaja(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const tipo = texto(fd, "tipo");
  const id = Number(texto(fd, "id"));
  if (!esTipo(tipo)) return { error: "Tipo de activo no válido." };
  const activo = await cargarActivo(tipo, id);
  if (!activo) return { error: "El activo ya no existe." };
  const negado = sinPermiso(usuario, activo.empresa, "seguros.registrar");
  if (negado) return { error: negado };
  if (activo.estado !== "activo" && activo.estado !== "activa") return { error: "Ya estaba dado de baja." };

  const entrada = bajaSchema.safeParse({ motivo_baja: texto(fd, "motivo_baja"), fecha_baja: texto(fd, "fecha_baja"), observaciones: texto(fd, "observaciones") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const { motivo_baja, fecha_baja, observaciones } = entrada.data;
  const adquisicion = "fecha_adquisicion" in activo ? iso(activo.fecha_adquisicion) : null;
  if (adquisicion && fecha_baja < adquisicion) return { error: `La baja no puede ser anterior a la adquisición (${adquisicion}).`, errores: { fecha_baja: "Fecha no válida" } };
  const retroactiva = fecha_baja < hoyPlanta();
  const estado = tipo === "vehiculo" ? (motivo_baja === "retiro" ? "retirado" : "vendido") : motivo_baja === "retiro" ? "retirada" : "vendida";
  const columna = tipo === "vehiculo" ? "id_vehiculo" : "id_propiedad";

  try {
    await db.$transaction(async (tx) => {
      const datos = { estado, motivo_baja, fecha_baja: fecha(fecha_baja), actualizado_por: usuario.id, actualizado_en: new Date() };
      if (tipo === "vehiculo") await tx.vehiculos.update({ where: { id: activo.id }, data: datos });
      else await tx.propiedades.update({ where: { id: activo.id }, data: datos });
      // Titularidades abiertas: terminan el día de la baja (si empezaron antes o ese día).
      await tx.titularidades.updateMany({ where: { empresa: activo.empresa, [columna]: activo.id, hasta: null, desde: { lte: fecha(fecha_baja)! } }, data: { hasta: fecha(fecha_baja) } });
      await registrarGestion(
        usuario.id,
        tipo === "vehiculo" ? "VEHICULOS" : "PROPIEDADES",
        `ID ${id} | BAJA por ${motivo_baja} el ${fecha_baja}${retroactiva ? " (RETROACTIVA)" : ""}`,
        tx,
        { empresa: activo.empresa, entidad: tipo === "vehiculo" ? "vehiculos" : "propiedades", idRegistro: id, operacion: retroactiva ? "BAJA RETROACTIVA" : "BAJA", motivo: observaciones },
      );
    });
  } catch (error) {
    console.error("[darDeBaja]", error);
    return { error: "No se pudo registrar la baja. Revisa que no haya titulares que empiecen después de esa fecha." };
  }
  revalidatePath(ruta(tipo, id));
  return { ok: true, mensaje: "Baja registrada. El activo se conserva en el historial." };
}

/** Registra un nuevo propietario legal o responsable administrativo; el anterior termina el día previo. */
export async function registrarTitular(_previo: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const usuario = await requerirSesion();
  const tipo = texto(fd, "tipo");
  const id = Number(texto(fd, "id"));
  if (!esTipo(tipo)) return { error: "Tipo de activo no válido." };
  const activo = await cargarActivo(tipo, id);
  if (!activo) return { error: "El activo ya no existe." };
  const negado = sinPermiso(usuario, activo.empresa, "seguros.registrar");
  if (negado) return { error: negado };

  const entrada = titularSchema.safeParse({ rol: texto(fd, "rol"), id_parte: texto(fd, "id_parte"), desde: texto(fd, "desde"), observaciones: texto(fd, "observaciones") });
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const d = entrada.data;
  const parte = await db.partes.findUnique({ where: { id: d.id_parte }, select: { empresa: true, estado: true, tipo: true, nombres: true, apellidos: true, razon_social: true } });
  if (!parte || parte.empresa !== activo.empresa || parte.estado !== "activa") return { error: "Elige una persona o empresa activa de esta misma empresa.", errores: { id_parte: "No válida" } };

  const columna = tipo === "vehiculo" ? "id_vehiculo" : "id_propiedad";
  const vigente = await db.titularidades.findFirst({
    where: { empresa: activo.empresa, [columna]: activo.id, rol: d.rol, hasta: null },
    include: { partes: { select: { tipo: true, nombres: true, apellidos: true, razon_social: true } } },
  });
  let hastaAnterior: string | null = null;
  if (vigente) {
    if (vigente.id_parte === d.id_parte) return { error: "Esa persona ya es el titular vigente." };
    const cierre = cierreTitularidad(iso(vigente.desde)!, d.desde);
    if (!cierre.ok) return { error: cierre.error, errores: { desde: "Fecha no válida" } };
    hastaAnterior = cierre.hasta;
  }

  try {
    await db.$transaction(async (tx) => {
      if (vigente && hastaAnterior) await tx.titularidades.update({ where: { id: vigente.id }, data: { hasta: fecha(hastaAnterior) } });
      const t = await tx.titularidades.create({
        data: { empresa: activo.empresa, [columna]: activo.id, rol: d.rol, id_parte: d.id_parte, desde: fecha(d.desde)!, observaciones: d.observaciones, creado_por: usuario.id },
      });
      await registrarGestion(
        usuario.id,
        tipo === "vehiculo" ? "VEHICULOS" : "PROPIEDADES",
        `ID ${id} | ${ROLES_TITULAR[d.rol].toUpperCase()}: ${nombreParte(parte)} desde ${d.desde}${vigente ? ` (antes ${nombreParte(vigente.partes)}, hasta ${hastaAnterior})` : ""} [titularidad ${t.id}]`,
        tx,
        { empresa: activo.empresa, entidad: tipo === "vehiculo" ? "vehiculos" : "propiedades", idRegistro: id, operacion: "TITULAR" },
      );
    });
  } catch (error) {
    if (codigoPg(error) === "23P01") return { error: "Las fechas se cruzan con otra titularidad de este activo." };
    console.error("[registrarTitular]", error);
    return { error: "No se pudo guardar. Intenta de nuevo." };
  }
  revalidatePath(ruta(tipo, id));
  revalidatePath(`/personas/${d.id_parte}`);
  return { ok: true, mensaje: vigente ? "Nuevo titular registrado; el anterior queda en el historial." : "Titular registrado." };
}
