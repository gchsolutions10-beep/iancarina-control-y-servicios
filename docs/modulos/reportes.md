# Reportes, tablero y avisos (Etapa 5)

## Tablero gerencial (`/reportes/tablero`)

- Indicadores **por moneda** (nunca se suman ni convierten monedas): pólizas vigentes y asegurados hoy,
  prima neta de las vigencias en curso (inicial + endosos confirmados), suma asegurada vigente,
  reconocido en siniestros del año, primas por pagar y vencidas, cuentas por cobrar y siniestros abiertos.
- Gráficas de una serie (`--viz-a`, validado para daltonismo; sin leyenda, el título nombra la serie)
  con tooltip y tabla con los mismos datos: prima neta por ramo (moneda elegida) y siniestros por mes
  (últimos 12 meses, sin anulados).
- Tablas de pólizas por vencer (`polizas.dias_por_vencer`) y primas vencidas o por vencer
  (`primas.dias_por_vencer`), con enlace a cada ficha.
- Lógica en `lib/reportes/tablero.ts`.

## Reportes (`/reportes/lista` y `/reportes/<id>`)

Definidos en `lib/reportes/definiciones.ts`; motor genérico puro en `lib/reportes/tipos.ts`
(probado en `tests/reportes.test.ts`). Cada reporte declara filtros y columnas tipadas; la misma
consulta alimenta la pantalla, el Excel y la impresión.

| Id | Reporte | Filtros |
|---|---|---|
| `polizas` | Pólizas y vigencias | empresa, aseguradora, ramo, estado, vence desde/hasta |
| `asegurados` | Asegurados por póliza a una fecha | empresa, corte, ramo, tipo, búsqueda |
| `ceco` | Detalle por CECO (prima neta = inicial y altas − devoluciones por bajas) | empresa, corte, ramo |
| `obligaciones` | Primas por pagar y cuentas por cobrar con antigüedad | empresa, tipo, estado, contraparte, vence hasta |
| `siniestros` | Siniestros con importes vigentes, cobrado y por cobrar | empresa, tipo, estado, evento desde/hasta |

- Filtros en la URL (se comparten copiando el enlace); solo se aceptan claves conocidas, fechas válidas
  y opciones existentes (`leerValores`). Etiquetas con «x» para quitar cada filtro.
- Totales al pie **por moneda**, sumados en céntimos con `BigInt` (sin float).
- Excel: `/reportes/<id>/excel` (CSV para Excel en español: «;», coma decimal, BOM). Trae todas las filas.
- Imprimir o PDF: `?imprimir=1` abre el diálogo de impresión sin menú ni filtros.
- En pantalla, hasta 500 filas.
- Siniestros confidenciales: sin afectado a quien no tiene «Ver datos personales» en esa empresa.

## Avisos (campana en la barra)

- `lib/avisos/fuentes.ts` → `GET /api/avisos`; reglas puras en `lib/avisos/reglas.ts`.
- Se calculan al pedirlos (no se guardan): desaparecen solos al renovar, pagar, cobrar o actuar.
- Pólizas por vencer o vencidas sin renovar (ventana de `polizas.dias_por_vencer` hacia adelante y hacia atrás).
- Primas por pagar vencidas (siempre, hasta pagarse o anularse) o por vencer (`primas.dias_por_vencer`).
- Cobros vencidos con saldo (reembolsos y devoluciones).
- Expedientes sin movimiento (`siniestros.dias_sin_movimiento`).
- La campana se actualiza cada 5 minutos y al cambiar de pantalla. Si el usuario tiene «Recibe alertas»
  y hay algo vencido, se abre sola una vez por sesión.
- Solo se ven avisos de las empresas del usuario.

## Pendiente

- Envío de avisos por correo (cuando el cliente defina el servidor de correo).
- Excel nativo (.xlsx) si el cliente lo pide; hoy es CSV que Excel abre directamente.
