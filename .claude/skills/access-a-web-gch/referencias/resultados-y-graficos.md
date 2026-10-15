# Resultado debajo del formulario (indicadores, gráficas y tabla)

Es lo que más valora el cliente: mientras carga, ve cómo cambian los resultados. Va **debajo** del
registro (nunca arriba), con el título «Resultado del 8 de octubre de 2026» (un día) o «Resultado
del período» (rango). Si no hay datos: un aviso corto, no gráficas vacías.

## Estructura

1. **Indicadores** (4 por fila en escritorio, 2 en tableta, 1 en teléfono): título corto, valor
   grande con unidad (`12,73 %`, `46.035 kg`, `3 de 4`) y una línea de detalle que da contexto
   («Promedio de 6 horas con datos», «+218 kg contra Suministro», «1 fuera del rango»).
   Elegir indicadores que respondan una pregunta del área (¿cuánto?, ¿cuántos fuera de norma?,
   ¿cuánto difiere de la otra área?), no sumar por sumar.
2. **Gráficas** (una o dos, en tarjetas con título y una frase que explique qué se ve):
   - Por hora o por día → **líneas** (tendencia) o barras verticales agrupadas (comparar dos áreas).
   - Por categoría (presentación, máquina, malla, categoría de maíz) → **barras horizontales**.
   - Contra un rango → líneas del valor + líneas grises del mínimo y máximo.
   - Un solo número no necesita gráfica: va como indicador.
3. **Tabla con los mismos datos** de la gráfica (accesibilidad y para quien prefiere números), con
   la fila del total o del promedio cuando aplique. Valores fuera de norma marcados con texto
   («Bajo», «revisar»), nunca solo con color.
4. **Exportar a Excel** con los mismos filtros (CSV con «;», coma decimal y BOM UTF-8).

Para comparar dos áreas que miden lo mismo (Suministro contra Calidad, Empaque contra Calidad):
indicador de la diferencia, gráfica con las dos series lado a lado y tabla con columna «Diferencia».

## Reglas de las gráficas (Recharts)

- Colores **solo** desde tokens `--viz-*` en `globals.css`, con variante para modo oscuro, y la
  paleta **validada** para daltonismo (script `validate_palette.js` de la skill de gráficas, en claro
  y en oscuro, pares adyacentes ΔE ≥ 8). Asignar colores por **entidad**, en orden fijo, nunca por
  posición. Gris (`--viz-otros`) para referencias (rangos, «sin tipo»).
- Paleta usada en Planta Maíz (válida para 4 series):
  claro `#2a78d6` (azul) · `#eb6834` (naranja) · `#1baf7a` (verde) · `#4a3aa7` (morado) · gris `#918b86`;
  oscuro `#3987e5` · `#d95926` · `#199e70` · `#9085e9` · gris `#78716c`.
- Siempre: **leyenda** propia arriba (si hay 2+ series), **tooltip** con el detalle de todas las
  series y la diferencia cuando aplique, eje con pocos números (sin la unidad si no cabe: la unidad
  va en el título), sin animaciones, líneas de 2 px con puntos de 4 px y borde del color de fondo,
  barras con esquinas de 4 px y ancho máximo.
- `role="img"` con una descripción («… El detalle está en la tabla.»).
- Un solo eje Y: dos medidas de distinta unidad van en dos gráficas.
- Funciones no pasan de servidor a cliente: pasar la unidad como texto y las series como datos.
- Las fechas en el eje como «08-oct»; en la tabla, «8 oct. 2026».

## Componentes reutilizables (Planta Maíz)

- `components/graficos/lineas.tsx` → `GraficoLineas({ datos, series, unidad, descripcion })`.
- `components/graficos/barras-horizontales.tsx` → una serie con valor al final de cada barra.
- Indicador: tarjeta `rounded-xl border bg-superficie p-4` con título `text-sm text-tinta-suave`,
  valor `text-2xl font-semibold tabular-nums` y detalle `text-xs text-tinta-tenue`.
- `PaginaHojaHoras` (planillas por hora): fecha, pestañas por turno, planilla y la ranura
  `resultado` que solo se muestra si hay horas con datos.

## Ejemplos que funcionaron

- Producción de empaque: bultos por presentación apilados JL/TPN, diferencia de kilos contra el peso
  promedio de Empaque y de Calidad.
- Recepción de materia prima: kg acondicionados Suministro contra Calidad (por camión en un día,
  por día en un período) y camiones por categoría de maíz.
- Control de procesos: humedad por hora en cuatro etapas del proceso, promedios por etapa.
- Flujo de vitaminas: muestreo manual y equipo contra el rango calculado (140–180 ppm), «3 de 4 en rango».
- Granulometría: retenido promedio por malla en barras horizontales y fila «la suma debe dar 100 %».
