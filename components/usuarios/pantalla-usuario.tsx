import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { FormularioUsuario, type OpcionesEmpresa, type ValoresUsuario } from "@/components/usuarios/formulario-usuario";
import { RestablecerClave } from "@/components/usuarios/restablecer-clave";
import { MensajeEstado } from "@/components/ui/campo";
import { Tarjeta } from "@/components/ui/tarjeta";
import { comoGestor, requerirSesion } from "@/lib/auth/dal";
import { listarEmpresas } from "@/lib/empresas";
import { formatearInstante } from "@/lib/tiempo";
import {
  empresasGestionables,
  esAdministrador,
  excepcionesOtorgables,
  PERMISOS_EXCEPCIONALES,
  puedeGestionar,
  puedeGestionarUsuarios,
  ROLES_EMPRESA,
  ROLES_GLOBALES,
  rolesAsignables,
} from "@/lib/usuarios/alcance";
import { obtenerUsuarioAdmin } from "@/lib/usuarios/datos";

const DETALLE_GLOBAL: Record<string, string> = {
  administrador: "Acceso total, incluida la gestión de todos los usuarios",
};

/** Alta (`id` null) o edición de un usuario, limitada a lo que el gestor puede administrar. */
export async function PantallaUsuario({ id, recienCreado }: { id: number | null; recienCreado?: boolean }) {
  const actor = await requerirSesion();
  const gestor = comoGestor(actor);
  if (!puedeGestionarUsuarios(gestor)) redirect("/sin-acceso");

  const u = id ? await obtenerUsuarioAdmin(id) : null;
  if (id && !u) notFound();
  if (u && !puedeGestionar(gestor, u.asignaciones)) redirect("/sin-acceso");

  const esUnoMismo = u?.id_usuario === actor.id;
  const admin = esAdministrador(gestor);
  const mios = empresasGestionables(gestor);
  // Activas, más las inactivas donde el usuario todavía tiene un rol (para poder quitárselo).
  const EMPRESAS = (await listarEmpresas()).filter((e) => e.activa || u?.asignaciones.empresas.some((a) => a.empresa === e.codigo));

  const iniciales: ValoresUsuario = {
    nombre_usuario: u?.nombre_usuario ?? "",
    nombre_apellido: u?.nombre_apellido ?? "",
    cedula: u?.cedula ?? "",
    cargo: u?.cargo ?? "",
    bloqueado: u?.bloqueado ?? false,
    recibe_alertas: u?.recibe_alertas ?? false,
    recibe_aprobaciones: u?.recibe_aprobaciones ?? false,
    globales: u?.asignaciones.globales ?? [],
    empresas: Object.fromEntries(
      EMPRESAS.map(({ codigo: d }) => {
        const a = u?.asignaciones.empresas.find((x) => x.empresa === d);
        const exc = u?.asignaciones.excepciones.filter((x) => x.empresa === d) ?? [];
        return [d, { rol: a?.rol ?? "", hasta: a?.vigenteHasta ?? "", excepciones: exc.map((e) => e.permiso), hastaExcepciones: exc[0]?.vigenteHasta ?? "" }];
      }),
    ),
  };

  const empresas: OpcionesEmpresa[] = EMPRESAS.map(({ codigo: d, nombre }) => {
    const editable = mios.includes(d) && (!esUnoMismo || admin);
    const actuales = iniciales.empresas[d];
    const asignables = rolesAsignables(gestor, d);
    const otorgables = excepcionesOtorgables(gestor, d);
    return {
      codigo: d,
      nombre,
      editable,
      // El rol actual se muestra aunque el gestor no pueda asignarlo (lo conserva si no lo cambia).
      roles: ROLES_EMPRESA.filter((r) => asignables.includes(r.codigo) || r.codigo === actuales.rol).map(({ codigo, nombre }) => ({ codigo, nombre })),
      excepciones: PERMISOS_EXCEPCIONALES.filter((p) => otorgables.includes(p.codigo) || actuales.excepciones.includes(p.codigo)),
    };
  });

  const rolesGlobales = admin
    ? ROLES_GLOBALES.filter((r) => r.codigo !== "desarrollador").map((r) => ({ codigo: r.codigo, nombre: r.nombre, detalle: DETALLE_GLOBAL[r.codigo] ?? "" }))
    : [];
  const puedeBloquear = !esUnoMismo && (u?.asignaciones.empresas.every((a) => mios.includes(a.empresa)) ?? true);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
      <Link
        href="/admin/usuarios"
        className="inline-flex items-center gap-1 rounded-md text-sm text-tinta-suave hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/40"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Usuarios
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-tinta sm:text-3xl">{u ? u.nombre_apellido.trim() || u.nombre_usuario : "Nuevo usuario"}</h1>
        {u && (
          <p className="mt-1 text-sm text-tinta-suave">
            {`ID ${u.id_usuario} · ${u.ultimo_acceso ? `Último acceso ${formatearInstante(u.ultimo_acceso)}` : "Nunca ha entrado"}`}
          </p>
        )}
      </header>

      {recienCreado && (
        <div className="mb-4">
          <MensajeEstado tipo="exito">Usuario creado. Entrégale su usuario y la clave temporal: la cambiará al entrar.</MensajeEstado>
        </div>
      )}

      <FormularioUsuario
        id={u?.id_usuario ?? null}
        iniciales={iniciales}
        empresas={empresas}
        rolesGlobales={rolesGlobales}
        esUnoMismo={esUnoMismo}
        puedeBloquear={puedeBloquear}
      />

      {u && !esUnoMismo && (
        <Tarjeta className="mt-4" titulo="Clave" descripcion="Si olvidó su clave o quedó bloqueado por intentos fallidos, asígnale una temporal: deberá cambiarla al entrar.">
          {u.debe_cambiar_clave && <p className="mb-3 text-sm text-tinta-suave">Tiene una clave temporal pendiente de cambiar.</p>}
          <RestablecerClave id={u.id_usuario} />
        </Tarjeta>
      )}
    </main>
  );
}
