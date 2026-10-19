"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const decimal = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const entero = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 });

/**
 * Barras de una sola serie (--viz-a, validado para daltonismo en claro y oscuro). Sin leyenda: el
 * título de la tarjeta nombra la serie. Debajo de cada gráfica va la tabla con los mismos datos.
 */
export function GraficaBarras({ datos, descripcion, unidad, decimales = false, horizontal = false, alto = 260 }: { datos: { etiqueta: string; valor: number }[]; descripcion: string; unidad?: string; decimales?: boolean; horizontal?: boolean; alto?: number }) {
  const eje = (v: number) => (decimales ? decimal.format(v).replace(/,00$/, "") : entero.format(v));
  const formato = (v: number) => `${(decimales ? decimal : entero).format(v)}${unidad ? ` ${unidad}` : ""}`;
  return (
    <figure aria-label={descripcion} className="w-full" style={{ height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke="var(--borde)" />
          {horizontal ? (
            <>
              <XAxis type="number" tick={{ fill: "var(--tinta-suave)", fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={decimales} tickFormatter={eje} />
              <YAxis type="category" dataKey="etiqueta" tick={{ fill: "var(--tinta-suave)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--borde-fuerte)" }} width={150} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey="etiqueta" tick={{ fill: "var(--tinta-suave)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--borde-fuerte)" }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "var(--tinta-suave)", fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={decimales} tickFormatter={eje} width={decimales ? 80 : 40} />
            </>
          )}
          <Tooltip
            cursor={{ fill: "var(--superficie-2)" }}
            contentStyle={{ background: "var(--superficie)", border: "1px solid var(--borde-fuerte)", borderRadius: 8, color: "var(--tinta)" }}
            formatter={(v) => [formato(Number(v)), descripcion]}
          />
          <Bar dataKey="valor" fill="var(--viz-a)" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 28 : 48} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
