import type { Metadata } from "next";
import { cargarDatosEjemplo, limpiarDatos } from "@/actions/base-datos";
import { SubnavegacionBaseDatos } from "@/components/base-datos/subnavegacion";
import { Tabla } from "@/components/fichas/piezas";
import { AvisoBloqueo, Seccion } from "@/components/formularios/controles";
import { Casilla, Entrada, FormularioAccion, Seleccion } from "@/components/formularios/formulario-accion";
import { requerirPermiso } from "@/lib/auth/dal";
import { CONFIRMACION, GRUPOS, ORDEN } from "@/lib/base-datos/grupos";
import { conteos } from "@/lib/base-datos/limpiar";
import { ejemplosPermitidos } from "@/lib/demo/cargar";
import { listarEmpresas } from "@/lib/empresas";
import { formatearEntero } from "@/lib/formato";

export const metadata: Metadata = { title: "Base de datos" };
// La carga de ejemplos sube fotos y calcula varias pólizas: puede tardar.
export const maxDuration = 300;

export default async function BaseDatos() {
  await requerirPermiso("admin.sistema");
  const empresas = await listarEmpresas();
  const porEmpresa = await Promise.all(empresas.map(async (e) => ({ empresa: e, conteo: await conteos([e.codigo]) })));
  const opciones = empresas.map((e) => ({ valor: e.codigo, etiqueta: e.nombre }));
  // Se muestran las fichas principales de cada grupo y, debajo, todas las filas relacionadas.
  const PRINCIPALES = { finanzas: ["obligaciones"], polizas: ["polizas"], activos: ["vehiculos", "propiedades"], personas: ["partes"] } as const;
  type Conteo = Awaited<ReturnType<typeof conteos>>;
  const principal = (c: Conteo, g: (typeof ORDEN)[number]) => c[g].filter((x) => (PRINCIPALES[g] as readonly string[]).includes(x.tabla)).reduce((s, x) => s + x.filas, 0);
  const total = (c: Conteo, g: (typeof ORDEN)[number]) => c[g].reduce((s, x) => s + x.filas, 0);
  const permitidos = ejemplosPermitidos();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <SubnavegacionBaseDatos actual="/admin/base-datos" />
      <div className="flex flex-col gap-6">
        <Seccion titulo="Registros por empresa" descripcion="Lo que hay hoy en cada grupo, y debajo todas las filas relacionadas (asegurados, cálculos, pagos, documentos…).">
          <Tabla
            columnas={["Empresa", "Obligaciones", "Pólizas", "Vehículos y propiedades", "Personas y organizaciones"]}
            vacio="No hay empresas."
            filas={porEmpresa.map(({ empresa, conteo }) => [empresa.nombre, ...ORDEN.map((g) => (
              <span key={g} className="tabular-nums">
                {formatearEntero(principal(conteo, g))}
                <span className="block text-xs text-tinta-tenue">{formatearEntero(total(conteo, g))} filas en total</span>
              </span>
            ))])}
          />
        </Seccion>

        <Seccion titulo="Datos de ejemplo" descripcion="Para presentar el sistema: 30 personas, 7 organizaciones (aseguradoras, corredor, taller, transportista), 32 vehículos y 6 propiedades con fotos, 5 pólizas con vigencias, renovación, endosos de alta y baja, pagos parciales y documentos.">
          {permitidos ? (
            <>
              <AvisoBloqueo>
                Todo queda marcado como ejemplo: organizaciones con «(DEMO)», identificaciones de la serie 90.000.000, observaciones «Registro de ejemplo (DEMO)» y fotos ilustrativas. Las tasas son
                solo de demostración. Se quita con «Limpiar datos».
              </AvisoBloqueo>
              <FormularioAccion accion={cargarDatosEjemplo} boton="Cargar datos de ejemplo">
                <Seleccion nombre="empresa" etiqueta="Empresa" opciones={opciones} valor={opciones.find((o) => o.valor.startsWith("demo"))?.valor ?? opciones[0]?.valor} vacio={false} className="sm:max-w-md" />
              </FormularioAccion>
            </>
          ) : (
            <AvisoBloqueo>Esta instalación no es la demo: aquí no se cargan datos de ejemplo, para no mezclarlos con datos reales.</AvisoBloqueo>
          )}
        </Seccion>

        <Seccion titulo="Limpiar datos" descripcion="Borra los registros de negocio elegidos para dejar el sistema en blanco. Se hace en una sola operación: si algo falla, no se borra nada.">
          <AvisoBloqueo>
            No se tocan empresas, usuarios, permisos, ajustes, catálogos ni las reglas generales de cálculo. La bitácora no se borra: la limpieza queda registrada en ella con su motivo. Al elegir un grupo se
            limpian también los que dependen de él (por ejemplo, personas arrastra sus vehículos, pólizas y pagos).
          </AvisoBloqueo>
          <FormularioAccion accion={limpiarDatos} boton="Limpiar" variante="secundario">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-tinta">Qué limpiar</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {ORDEN.map((g) => (
                  <Casilla
                    key={g}
                    nombre="grupos"
                    valorCasilla={g}
                    etiqueta={
                      <span>
                        <span className="font-medium">{GRUPOS[g].titulo}</span>
                        <span className="block text-xs text-tinta-suave">{GRUPOS[g].detalle}</span>
                      </span>
                    }
                  />
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <Seleccion nombre="empresa" etiqueta="Empresa" opciones={[...opciones, { valor: "*", etiqueta: "Todas las empresas" }]} />
              <Entrada nombre="motivo" etiqueta="Motivo" placeholder="Fin de la presentación" />
              <Entrada nombre="confirmacion" etiqueta={`Escribe ${CONFIRMACION} para confirmar`} mayusculas />
            </div>
          </FormularioAccion>
        </Seccion>
      </div>
    </main>
  );
}
