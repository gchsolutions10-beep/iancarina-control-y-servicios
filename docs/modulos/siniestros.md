# Siniestros (Etapa 4)

Rutas: `/siniestros/lista` (y `?sujeto=transporte` para Transporte contratado), `/siniestros/nuevo`,
`/siniestros/[id]`, Configuración → `/admin/flujos`, límites en cada período de póliza y cobros en
Finanzas → Cuentas por cobrar (`/finanzas/primas?ver=cobrar`). Migración `006_siniestros.sql`.

## Modelo
- **Flujos y etapas configurables** (`flujos`, `flujo_etapas` con documentos requeridos por etapa).
  «Vehículos propios» es el del requerimiento (notificación → orden de reparación → entrada a taller →
  entrega → reembolso). Personas, propiedades y transporte usan «General (provisional)» (notificación →
  documentación → evaluación de la aseguradora → indemnización/reembolso) hasta que el cliente defina
  los suyos (pregunta 30; GCH eligió flujo propio editable el 2026-10-19).
- **Tipos de siniestro** (`tipos_siniestro`): qué se afecta (vehículo, persona, propiedad o transporte)
  y qué flujo sigue. El expediente copia el flujo al abrirse.
- **Expediente** (`siniestros`): número **SIN-AAAA-NNNN** por empresa y año (pregunta 23, confirmado
  el 2026-10-19), N.º de la aseguradora aparte, fechas de evento y notificación, lugar, descripción,
  pérdida parcial/total, moneda, estado (abierto/cerrado/anulado) y la póliza (período) que responde.
- **Afectados** (`siniestro_afectados`): uno o varios; cada uno es a lo sumo un vehículo, una persona o
  una propiedad, con daños y, si corresponde, la inclusión y cobertura que responde.
- **Transporte contratado** (`siniestro_transporte`): transportista, placa o vehículo propio,
  mercancía, guía, valor y pérdida. No se vincula solo con las pólizas propias (R15).
- **Etapas** (`siniestro_etapas`, una sola abierta), **actuaciones** y **importes** (presupuestado,
  autorizado, reconocido) con historial: vale el último de cada tipo (`vw_siniestro_importes`); importes
  y actuaciones no se editan ni se borran.
- **Límites** (`limites`, por período): agregado anual o por bien, opcionalmente por cobertura;
  consumen el monto reconocido (propuesta base, pregunta 8) o el autorizado.
- **Reembolso por cobrar**: obligación `por_cobrar` / `reembolso_siniestro` con `id_siniestro`; los
  cobros se imputan como cualquier pago (ingreso). Documentos del expediente en `documentos.id_siniestro`.

## Reglas
- El vínculo con la póliza es **explícito**: solo se ofrecen las inclusiones del afectado en períodos
  confirmados que lo cubrían en la fecha del evento, con sus coberturas.
- **Autorizado ≠ pagado; reconocido ≠ cobrado.** Lo cobrado sale solo de las imputaciones. Cerrar el
  expediente no cierra la cuenta por cobrar: queda en la tarjeta «Cerrados por cobrar» (R12).
- **Límites (R16):** al registrar un importe que consume un límite se evalúa el consumo de todos los
  expedientes no anulados del período (por bien: los del mismo vehículo, propiedad o persona). Desde
  el porcentaje de Ajustes (80 %) avisa; si pasaría del 100 % **bloquea** y muestra el cálculo:
  «límite − consumido por otros = disponible; quedaría en X %». Un importe nuevo reemplaza al anterior
  del mismo expediente (no se suma dos veces).
- **Etapas:** al terminar una etapa se piden sus documentos requeridos (por tipo de documento); se
  puede continuar sin ellos marcándolo de forma explícita.
- **Confidencialidad:** los de personas son confidenciales: sin «Ver datos personales» se listan como
  «Confidencial» y la ficha no muestra nada; cada consulta del expediente queda en la bitácora. Sus
  documentos se guardan siempre como confidenciales.
- **Sin movimiento:** un expediente abierto sin etapas, actuaciones ni importes en N días (Ajustes,
  15) aparece en la tarjeta «Sin movimiento».
- Anular un expediente exige «Anular y ajustar» y que no tenga cuentas por cobrar vigentes; los anulados
  no consumen límites.

## Pruebas
- `tests/siniestros.test.ts`: numeración, importe vigente, consumo y bloqueo de límites, etapas,
  documentos faltantes y estado de control.
- `tests/bd/siniestros.test.ts`: flujo de vehículos, expediente único, afectados, etapa abierta única,
  importes inmutables con vigente por vista, reembolso ligado y cobro solo con ingresos.
- Punta a punta: crear, vincular póliza, importe bloqueado por el límite por vehículo y por el anual,
  documentos faltantes, actuación, cuenta por cobrar, cierre con saldo por cobrar, usuario de consulta
  (sin controles y con el expediente confidencial oculto).

## Pendiente
- Flujos propios de personas y propiedades (pregunta 30) y confirmar qué importe consume el límite (8).
- Avisos (campana) de expedientes sin movimiento y cuentas vencidas (pregunta 28): Etapa 5.
