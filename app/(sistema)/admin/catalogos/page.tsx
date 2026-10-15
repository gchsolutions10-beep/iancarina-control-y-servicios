import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { agregarCatalogo } from "@/actions/catalogos";
import { AyudaModulo } from "@/components/ayuda/ayuda-modulo";
import { BotonAlternar } from "@/components/fichas/boton-alternar";
import { Encabezado } from "@/components/fichas/piezas";
import { Seccion } from "@/components/formularios/controles";
import { Entrada, FormularioAccion, Seleccion } from "@/components/formularios/formulario-accion";
import { requerirSesion, tienePermiso } from "@/lib/auth/dal";
import { guia } from "@/lib/ayuda/guias";
import { LISTAS, type Lista } from "@/lib/catalogos";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Catálogos" };

export default async function Catalogos() {
  const usuario = await requerirSesion();
  if (!tienePermiso(usuario, "admin.sistema")) redirect("/sin-acceso");
  const [valores, marcas] = await Promise.all([
    db.catalogo_valores.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] }),
    db.marcas.findMany({ orderBy: { nombre: "asc" }, include: { modelos: { orderBy: { nombre: "asc" } } } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Encabezado titulo="Catálogos" subtitulo="Listas de los formularios. Pulsa un valor para desactivarlo o activarlo; nada se borra." ayuda={<AyudaModulo guia={guia("catalogos")} />} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Seccion titulo="Marcas y modelos de vehículos" descripcion="El modelo se elige como «Marca Modelo» en la ficha del vehículo.">
          <div className="flex flex-col gap-4">
            {marcas.length === 0 && <p className="text-sm text-tinta-suave">Todavía no hay marcas.</p>}
            {marcas.map((m) => (
              <div key={m.id}>
                <BotonAlternar que="marca" id={m.id} nombre={m.nombre} activo={m.activo} />
                <div className="mt-2 ml-3 flex flex-wrap gap-1.5 border-l border-borde pl-3">
                  {m.modelos.map((mo) => (
                    <BotonAlternar key={mo.id} que="modelo" id={mo.id} nombre={mo.nombre} activo={mo.activo} />
                  ))}
                  {m.modelos.length === 0 && <span className="text-xs text-tinta-tenue">Sin modelos</span>}
                </div>
              </div>
            ))}
            <div className="grid gap-4 border-t border-borde pt-4 sm:grid-cols-2">
              <FormularioAccion accion={agregarCatalogo} boton="Agregar marca" variante="secundario" ocultos={{ que: "marca" }}>
                <Entrada nombre="nombre" etiqueta="Nueva marca" mayusculas />
              </FormularioAccion>
              {marcas.length > 0 && (
                <FormularioAccion accion={agregarCatalogo} boton="Agregar modelo" variante="secundario" ocultos={{ que: "modelo" }}>
                  <Seleccion nombre="id_marca" etiqueta="Marca" opciones={marcas.filter((m) => m.activo).map((m) => ({ valor: String(m.id), etiqueta: m.nombre }))} />
                  <Entrada nombre="nombre" etiqueta="Nuevo modelo" mayusculas />
                </FormularioAccion>
              )}
            </div>
          </div>
        </Seccion>
        {(Object.keys(LISTAS) as Lista[]).map((lista) => (
          <Seccion key={lista} titulo={LISTAS[lista].titulo} descripcion={LISTAS[lista].detalle}>
            <div className="flex flex-wrap gap-1.5">
              {valores
                .filter((v) => v.lista === lista)
                .map((v) => (
                  <BotonAlternar key={v.id} que={lista} id={v.id} nombre={v.nombre} activo={v.activo} />
                ))}
            </div>
            <FormularioAccion accion={agregarCatalogo} boton="Agregar" variante="secundario" ocultos={{ que: lista }} className="mt-4">
              <Entrada nombre="nombre" etiqueta="Nuevo valor" />
            </FormularioAccion>
          </Seccion>
        ))}
      </div>
    </main>
  );
}
