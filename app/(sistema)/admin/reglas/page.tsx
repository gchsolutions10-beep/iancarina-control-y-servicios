import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cambiarEstadoRegla, deshacerVersionRegla, nuevaVersionRegla } from "@/actions/reglas";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { Encabezado, Tabla } from "@/components/fichas/piezas";
import { BotonAccion } from "@/components/formularios/boton-accion";
import { Seccion } from "@/components/formularios/controles";
import { AreaTexto, Entrada, FormularioAccion, Seleccion } from "@/components/formularios/formulario-accion";
import { MarcaPropuesta } from "@/components/polizas/piezas";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { FUNCIONES, VARIABLES } from "@/lib/dominio/calculo/expresiones";
import { reglasCalculo } from "@/lib/polizas/datos";
import { hoyPlanta } from "@/lib/tiempo";

export const metadata: Metadata = { title: "Reglas de cálculo" };

const TIPOS = { suma_asegurada: "Suma asegurada", prima: "Prima anual", prorrateo: "Prorrateo" } as const;
const ESTADOS = { propuesta: "Propuesta", aprobada: "Aprobada", retirada: "Retirada" } as const;

export default async function Reglas() {
  const usuario = await requerirSesion();
  if (!tienePermiso(usuario, "admin.sistema")) redirect("/sin-acceso");
  const reglas = await reglasCalculo();
  const hoy = hoyPlanta();

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado
        titulo="Reglas de cálculo"
        subtitulo="Fórmulas de suma asegurada y prima, y métodos de prorrateo. Las tasas y primas fijas de cada contrato se cargan en las tarifas de cada período."
        ayuda={<AyudaModulo guia={guia("reglas")} />}
      />
      <div className="flex flex-col gap-6">
        <Seccion titulo="Cómo se escriben las fórmulas" descripcion="Lenguaje propio y seguro: números con punto decimal, + − × ÷, paréntesis, comparaciones y funciones.">
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <h3 className="mb-1 font-medium text-tinta">Variables</h3>
              <ul className="flex flex-col gap-1 text-tinta-suave">
                {Object.entries(VARIABLES).map(([v, d]) => (
                  <li key={v}>
                    <code className="text-tinta">{v}</code>: {d}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-tinta">Funciones</h3>
              <p className="text-tinta-suave">{FUNCIONES.join(", ")}. Ejemplo: <code className="text-tinta">si(valor_bien &gt; 50000, suma_asegurada * tasa / 100, prima_fija)</code></p>
              <p className="mt-3 text-tinta-suave">
                Gana la regla más específica: póliza › aseguradora › cobertura › ramo › general. Si falta un dato, el cálculo queda como simulación y la confirmación se bloquea diciendo qué falta.
                Redondeo: mitad hacia arriba a los decimales de la regla.
              </p>
            </div>
          </div>
        </Seccion>
        <Seccion titulo="Reglas" descripcion="Una regla no se edita: se crea una versión nueva desde una fecha; lo calculado conserva la versión usada. «Propuesta» = práctica de mercado autorizada por GCH, pendiente de confirmar con el contrato.">
          <Tabla
            columnas={["Regla", "Tipo", "Ámbito", "Fórmula o método", "Vigencia", "Estado", "Usos", ""]}
            vacio="Sin reglas."
            filas={reglas.map((r) => [
              <span key="n">
                {r.nombre} <span className="text-xs text-tinta-tenue">v{r.version}</span>
                {r.descripcion && <span className="block text-xs text-tinta-suave">{r.descripcion}</span>}
              </span>,
              TIPOS[r.tipo as keyof typeof TIPOS],
              r.ambito,
              r.expresion ? <code key="e" className="text-xs">{r.expresion}</code> : `${r.evento === "alta" ? "Alta" : "Baja"}: ${r.metodo === "dias" ? `días ÷ ${r.base_dias}` : "solo importe de la aseguradora"}`,
              `${r.vigente_desde}${r.vigente_hasta ? ` → ${r.vigente_hasta}` : " en adelante"}`,
              r.estado === "propuesta" ? <MarcaPropuesta key="p" /> : ESTADOS[r.estado as keyof typeof ESTADOS],
              r.usos,
              r.estado !== "retirada" && !r.vigente_hasta ? (
                <div key="a" className="flex min-w-56 flex-col items-start gap-2">
                  {r.estado === "propuesta" ? (
                    <BotonAccion accion={cambiarEstadoRegla} ocultos={{ id: String(r.id), estado: "aprobada" }}>
                      Aprobar
                    </BotonAccion>
                  ) : (
                    <BotonAccion accion={cambiarEstadoRegla} ocultos={{ id: String(r.id), estado: "propuesta" }} variante="fantasma">
                      Volver a propuesta
                    </BotonAccion>
                  )}
                  {r.id_regla_anterior !== null && r.usos === 0 && (
                    <BotonAccion
                      accion={deshacerVersionRegla}
                      ocultos={{ id: String(r.id) }}
                      variante="fantasma"
                      confirmar={`¿Deshacer la v${r.version}? Se retira y la versión anterior vuelve a valer sin fecha de fin.`}
                    >
                      Deshacer versión
                    </BotonAccion>
                  )}
                  <details>
                    <summary className="cursor-pointer text-xs text-tinta-suave">Nueva versión</summary>
                    <FormularioAccion accion={nuevaVersionRegla} boton="Crear versión" variante="secundario" ocultos={{ id: String(r.id) }} className="mt-2">
                      {r.tipo === "prorrateo" ? (
                        <>
                          <Seleccion nombre="metodo" etiqueta="Método" valor={r.metodo} vacio={false} opciones={[{ valor: "dias", etiqueta: "Días exactos" }, { valor: "solo_aseguradora", etiqueta: "Solo importe de la aseguradora" }]} />
                          <Seleccion nombre="base_dias" etiqueta="Base de días" valor={String(r.base_dias ?? "")} opciones={[{ valor: "365", etiqueta: "365" }, { valor: "366", etiqueta: "366" }, { valor: "360", etiqueta: "360" }]} />
                        </>
                      ) : (
                        <Entrada nombre="expresion" etiqueta="Fórmula" valor={r.expresion} />
                      )}
                      <Entrada nombre="vigente_desde" etiqueta="Vigente desde" tipo="date" valor={hoy} />
                      <Seleccion nombre="estado" etiqueta="Estado" valor="aprobada" vacio={false} opciones={[{ valor: "aprobada", etiqueta: "Aprobada (del contrato)" }, { valor: "propuesta", etiqueta: "Propuesta" }]} />
                      <AreaTexto nombre="descripcion" etiqueta="Descripción" valor={r.descripcion} />
                    </FormularioAccion>
                  </details>
                </div>
              ) : r.estado !== "retirada" ? (
                <p key="h" className="max-w-56 text-xs text-tinta-tenue">
                  Reemplazada por la v{r.version + 1}. Para que esta vuelva a valer (y poder cambiar su estado), use «Deshacer versión» en la v{r.version + 1}, si todavía no se usó.
                </p>
              ) : null,
            ])}
          />
        </Seccion>
      </div>
    </main>
  );
}
