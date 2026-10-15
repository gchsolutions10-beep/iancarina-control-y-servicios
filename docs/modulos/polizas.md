# Pólizas, renovación anual y primas por pagar (Etapa 3)

Rutas: `/polizas/lista`, `/polizas/[id]`, `/polizas/periodos/[id]`, `/polizas/renovaciones`,
`/finanzas/primas`, `/finanzas/primas/[id]`, Configuración → `/admin/reglas` y ramos/coberturas en
`/admin/catalogos`. Migración `004_polizas.sql`.

## Modelo
- **Póliza ≠ período.** `polizas` es el contrato (aseguradora, número, ramo); cada vigencia es una
  fila de `poliza_periodos` (`borrador` → `confirmado`, o `anulado` si se descarta). La renovación
  crea el período siguiente con `id_periodo_anterior`; los anteriores no se tocan.
- **Fechas como en la póliza:** rango `[desde, hasta)`, `hasta` = fecha de fin que figura en el
  contrato. 2026-01-01 → 2027-01-01 = 365 días. Una baja el día F deja la cobertura en `[desde, F)`.
- **Partes del período** (`periodo_partes`): tomador (obligatorio), contratante, pagador, corredor,
  con fechas. Ser tomador no hace a nadie asegurado.
- **Asegurados** (`inclusiones`): exactamente uno de persona, vehículo o propiedad (según el ramo),
  sin repetirse en el período en las mismas fechas, con certificado, CECO (texto libre, pregunta 14),
  clase de tarifa, valor del bien, aditamentos y suma asegurada. Coberturas en
  `inclusion_coberturas`; beneficiarios con porcentaje (Σ ≤ 100 % en cada fecha).
- **Tarifas del período** (`periodo_tarifas`): tasa anual (%) y/o prima fija anual por cobertura y,
  si aplica, por clase (tipo de vehículo para RCV). Cambian año a año; la renovación las copia.
- **Endosos** (`endosos` + `endoso_lineas`): alta, baja, cambio de parte, beneficiarios. Único
  camino para cambiar un período confirmado: la base lo impide con disparadores
  (`proteger_periodo`, `proteger_inclusion`, `proteger_inclusion_cobertura`, `proteger_tarifa`,
  `proteger_con_fechas`).

## Cálculo (motor configurable)
- Lenguaje propio sin `eval` (`lib/dominio/calculo/expresiones.ts`): variables `valor_bien`,
  `aditamentos`, `suma_asegurada`, `tasa`, `prima_fija`, `dias`, `dias_periodo`; `+ − × ÷`,
  comparaciones, `min`, `max`, `si`, `redondear`. Aritmética decimal (`decimal.js`).
- Reglas en `reglas_calculo` (suma asegurada, prima, prorrateo de alta/baja) con ámbito; gana la más
  específica (póliza › aseguradora › cobertura › ramo › empresa › general) vigente en la fecha.
  No se editan: «Nueva versión» desde una fecha; la anterior vale hasta el día previo.
- La **propuesta base** (`docs/REGLAS-Y-PENDIENTES.md` §2) se cargó como reglas en estado
  «Propuesta», sin ningún importe: suma = valor + aditamentos (sin aditamentos declarados = 0);
  casco = suma × tasa / 100; RCV y demás = prima fija; general = suma × tasa / 100; alta y baja a
  prorrata días / 365. Redondeo mitad hacia arriba a 2 decimales por cobertura; el total es la suma
  de lo redondeado y no cuenta las coberturas «incluidas en» otra.
- Cada cálculo queda en `calculos` (regla, versión, expresión exacta, entradas, faltantes):
  `simulacion` mientras el período está en preparación, `definitivo` al confirmar.
- Si falta un dato (tasa, prima fija, valor del bien, regla) el cálculo queda incompleto y
  **confirmar se bloquea** con el mensaje de qué falta y en cuántos asegurados.
- Importe de la aseguradora: reemplaza al calculado con motivo; se conserva el calculado
  (`prima_calculada`) y queda en la bitácora como «AJUSTE PRIMA».

## Flujo
1. Nueva póliza → período 1 en preparación con su tomador.
2. Tarifas, asegurados (se calculan al agregarlos), «Calcular primas».
3. «Confirmar período» (vencimiento + recibo): genera la **prima por pagar** (`obligaciones` +
   movimiento `cargo`) por el total del período.
4. Endosos: «Simular» (no guarda nada) → «Confirmar endoso» con el N.º de la aseguradora. Alta =
   prorrata de los días que faltan (obligación por pagar); baja = devolución de los días restantes
   (obligación **por cobrar**, `devolucion_prima`). Cálculo incompleto → solo con el importe de la
   aseguradora y motivo. Fecha anterior a hoy = «ENDOSO RETROACTIVO» en la bitácora.
5. Renovación: «Preparar renovación» copia partes vigentes, tarifas, asegurados elegibles con sus
   coberturas y beneficiarios, y valores del año anterior; recalcula y muestra los excluidos con su
   motivo y la comparación por cobertura y CECO (prima neta = inicial + altas − devoluciones).
   Elegibilidad (`lib/dominio/elegibilidad.ts`): fuera lo vendido/retirado antes del inicio, lo dado
   de baja por endoso y las personas con ficha no activa.

## Primas por pagar
- Saldo = Σ movimientos − Σ imputaciones vigentes, desde la vista `vw_saldos_obligaciones`.
  Pagos parciales; un pago no pasa del saldo, ni de su monto, ni cambia de moneda (disparador
  `imputaciones_validar`). Tarjetas: vencidas, por vencer (ajuste `primas.dias_por_vencer`),
  pendientes, pagadas. Saldos por moneda, nunca sumados entre monedas.
- Anular un pago exige «Anular y ajustar»: se revierten sus imputaciones con registros inversos y el
  pago queda anulado con motivo. Movimientos e imputaciones no se editan ni se borran.

## Pruebas
- `tests/calculo.test.ts`: expresiones, faltantes, elección de regla, redondeo, prorrata, totales,
  vigencias, elegibilidad, saldos y formato.
- `tests/bd/polizas.test.ts`: propuesta sin importes, un sujeto por inclusión y sin solapes,
  vigencias sin solape, separación de empresas, período confirmado inmutable salvo endoso, pagos
  parciales con reversión, reglas versionadas.
- Punta a punta (Playwright): crear póliza, bloqueo por tarifa faltante, prorrata de alta en
  preparación, confirmar (1.380,44 USD verificado a mano), endoso de alta y de baja con simulación,
  pago parcial, pago mayor al saldo rechazado, anulación, renovación con excluido, usuario de consulta
  sin controles, teléfono (sin desplazamiento horizontal) y modo oscuro.

## Pendiente / por confirmar
- Fórmulas y prorrateos reales de cada aseguradora (preguntas 3–7): aprobar o versionar las reglas.
- Tabla de corto plazo para cancelación total (no se implementó la cancelación de la póliza).
- Formato de CECO y organización (pregunta 14); fraccionamiento de la prima en cuotas; comisiones
  del corredor (pregunta 26).
- Anular un período confirmado y ajustes de obligaciones (aumento/disminución): Etapa 5.
- Si se vuelve a hacer `prisma db pull`, Prisma interpreta como 1:1 las relaciones con índices únicos
  parciales (`obligaciones`, `other_poliza_periodos`, `other_imputaciones`): dejarlas como listas `[]`.
