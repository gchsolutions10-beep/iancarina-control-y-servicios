"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Fila = { clave: string; anterior: string; actual: string };

const numero = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Prima por cobertura: período anterior contra el actual (barras agrupadas). Colores --viz-a/--viz-b
 * validados para daltonismo en claro y oscuro; la tabla de abajo muestra los mismos datos.
 */
export function GraficaComparacion({ filas, moneda, anterior, actual }: { filas: Fila[]; moneda: string; anterior: string; actual: string }) {
  const datos = filas.map((f) => ({ clave: f.clave, anterior: Number(f.anterior), actual: Number(f.actual) }));
  return (
    <figure aria-label={`Prima por cobertura en ${moneda}: ${anterior} contra ${actual}`} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--borde)" />
          <XAxis dataKey="clave" tick={{ fill: "var(--tinta-suave)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--borde-fuerte)" }} interval={0} />
          <YAxis tick={{ fill: "var(--tinta-suave)", fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => numero.format(v).replace(/,00$/, "")} width={72} />
          <Tooltip
            cursor={{ fill: "var(--superficie-2)" }}
            contentStyle={{ background: "var(--superficie)", border: "1px solid var(--borde-fuerte)", borderRadius: 8, color: "var(--tinta)" }}
            formatter={(v) => `${numero.format(Number(v))} ${moneda}`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--tinta-suave)" }} />
          <Bar dataKey="anterior" name={anterior} fill="var(--viz-a)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="actual" name={actual} fill="var(--viz-b)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
