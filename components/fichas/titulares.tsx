import Link from "next/link";
import { registrarTitular } from "@/actions/activos";
import { AreaTexto, Entrada, FormularioAccion, Seleccion, type Opcion } from "@/components/formularios/formulario-accion";
import { Seccion } from "@/components/formularios/controles";
import { ROLES_TITULAR } from "@/lib/validations/fichas";
import { Insignia, Tabla } from "./piezas";

type Titularidad = { id: number; rol: string; id_parte: number; parte: string; desde: string; hasta: string | null; observaciones: string | null };

/** Propietario legal y responsable administrativo de un activo, con su historial. */
export function SeccionTitulares({ tipo, id, titularidades, partes, puedeRegistrar, activo }: { tipo: "vehiculo" | "propiedad"; id: number; titularidades: Titularidad[]; partes: Opcion[]; puedeRegistrar: boolean; activo: boolean }) {
  return (
    <Seccion titulo="Propietario y responsable" descripcion="Al registrar un nuevo titular, el anterior termina el día previo y queda en el historial.">
      <Tabla
        columnas={["Rol", "Persona o empresa", "Desde", "Hasta", "Estado"]}
        vacio="Sin titulares registrados."
        filas={titularidades.map((t) => [
          ROLES_TITULAR[t.rol as keyof typeof ROLES_TITULAR] ?? t.rol,
          <Link key="p" href={`/personas/${t.id_parte}`} className="text-marca-700 hover:underline dark:text-marca-400">
            {t.parte}
          </Link>,
          t.desde,
          t.hasta ?? "—",
          <Insignia key="e" estado={t.hasta ? "terminada" : "vigente"} />,
        ])}
      />
      {puedeRegistrar && activo && (
        <details className="mt-4 rounded-lg border border-borde p-4">
          <summary className="cursor-pointer text-sm font-medium text-tinta">Registrar titular</summary>
          {partes.length === 0 ? (
            <p className="mt-3 text-sm text-tinta-suave">
              Primero registra la persona o empresa en <Link href="/personas/nueva" className="text-marca-700 underline dark:text-marca-400">Personas</Link>.
            </p>
          ) : (
            <FormularioAccion accion={registrarTitular} boton="Registrar titular" ocultos={{ tipo, id: String(id) }} className="mt-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Seleccion nombre="rol" etiqueta="Rol" opciones={Object.entries(ROLES_TITULAR).map(([valor, etiqueta]) => ({ valor, etiqueta }))} valor="propietario_legal" vacio={false} />
                <Seleccion nombre="id_parte" etiqueta="Persona o empresa" opciones={partes} className="sm:col-span-2" />
              </div>
              <Entrada nombre="desde" etiqueta="Desde" tipo="date" />
              <AreaTexto nombre="observaciones" etiqueta="Observaciones" />
            </FormularioAccion>
          )}
        </details>
      )}
    </Seccion>
  );
}
