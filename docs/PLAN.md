# Plan del proyecto — Control de Seguros y Activos

## 1. Auditoría: qué existe hoy

**Repositorio `iancarina-control-y-servicios`:** vacío al empezar (sin commits, sin código ni base).
No hay modelo de datos previo: se diseña desde cero (`docs/MODELO-DATOS.md`).

**Método y código de referencia** (no se modifican; solo se copian piezas):

| Fuente | Qué aporta |
|---|---|
| Kit GCH (`.claude/skills/`) | Método, stack, estándar de UI, sistema base, forma de trabajo y entrega |
| `iancarina-dpto-legal` | Base más completa: usuarios con rol por área y vencimiento, ajustes, archivos con validación por contenido, avisos, componentes de reportes (filtros en URL, Excel, impresión), migrador, demo en Vercel + Neon |
| `iancarina-planta-maiz` | Bitácora estilo `tgesth`, reglas de edición centralizadas, patrón «resultado debajo», gráficas validadas para daltonismo, manual por rol |

**Stack** (igual que los modelos): Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript estricto,
Tailwind 4 con tokens, Prisma 7 + `@prisma/adapter-pg`, Zod 4, `jose` + `bcryptjs` (sin proveedores
externos: funciona en intranet), Recharts, `node:test` + `tsx`, Playwright (Chromium instalado).

**Diferencias con los proyectos modelo**

1. **No hay Access** (por confirmar, pregunta 18): la base nace con la web, así que se usan llaves
   foráneas y restricciones reales desde la primera migración, en vez de agregarlas `NOT VALID` después.
2. **Áreas → empresas**: en Legal el permiso se da por departamento; aquí por empresa/filial.
3. **Archivos de la demo fuera de la BD**: Legal guarda los archivos de la demo en `bytea`; aquí está
   prohibido, se usa almacenamiento de objetos.
4. **Dinero y cálculos**: los modelos no manejan importes contractuales; aquí hacen falta aritmética
   decimal, monedas y movimientos.

## 2. Arquitectura propuesta

```
app/(publico)/              portada con login
app/(sistema)/
  personas/  activos/{vehiculos,propiedades}/  polizas/  renovaciones/  siniestros/
  finanzas/  reportes/  tablero/  configuracion/  admin/{usuarios,ajustes,bitacora}
app/archivos/[id]/route.ts  descarga con permiso y bitácora
actions/<dominio>.ts        server actions (sesión → alcance empresa → permiso → Zod → transacción + bitácora)
lib/
  auth/        sesion, dal (alcance por empresa), permisos
  dominio/     lógica pura con pruebas: calculo/ (expresiones, prorrateo, redondeo), vigencias,
               elegibilidad, saldos, limites, flujos
  datos/       consultas server-only por dominio
  almacen/     interfaz Almacen + adaptadores carpeta.ts y nube.ts
  ajustes.ts  auditoria.ts  tiempo.ts  csv.ts  formato.ts
db/migraciones/  db/semillas/demo.sql  db/vistas (dentro de migraciones)
scripts/      migrar, preparar-demo, vercel-build, usuario-soporte, cargar-excel (si aplica)
tests/        lógica pura (npm test) · tests/bd/ (contra PostgreSQL desechable)
```

**Adaptadores** (mismo código en los dos entornos; solo cambia `.env`):

| Pieza | Demo (Vercel + Neon) | Producción (intranet) |
|---|---|---|
| Base | Neon, cadena *pooled*; migraciones en `vercel-build` | PostgreSQL del cliente, `npm run db:migrar` |
| Archivos | `ALMACEN=nube`: almacenamiento de objetos compatible S3 o Vercel Blob (pregunta 27); subida directa firmada para pasar el límite de 4,5 MB de Vercel y validación del contenido en el servidor antes de registrar el documento | `ALMACEN=carpeta`: `ARCHIVOS_RUTA_BASE` (carpeta compartida montada en el servidor); la ruta final se arma con la clave generada y se verifica que quede dentro de la base |
| Datos | sintéticos, marcados «DEMO» | reales, solo en el servidor |

## 3. Etapas

### Etapa 2 — Núcleo
Base del sistema copiada de Legal y adaptada (login, sesión, usuarios, roles administrador/estándar,
acceso por empresa, ajustes, tema, menú, guías «i», bitácora append-only), empresas, partes, personas
(con detección y consolidación de duplicados), relaciones empresariales, vehículos, propiedades,
titularidades con historial, catálogos de Configuración, documentos y fotografías con **ambos**
adaptadores de almacenamiento, migrador y PostgreSQL desechable para pruebas de base.
*Orden ajustado:* el adaptador de almacenamiento se adelanta de la Etapa 6 a la 2 porque los
documentos de personas y activos lo necesitan; la Etapa 6 queda para despliegue e instalación.

### Etapa 3 — Pólizas y renovaciones
Aseguradoras, ramos, coberturas, pólizas, períodos, partes del período, certificados, inclusiones,
coberturas por inclusión, beneficiarios, endosos (altas, bajas, cambios), motor de cálculo
(expresiones seguras, parámetros versionados, cálculos guardados, ajustes manuales), simulador de
prorrateo, asistente de renovación con comparación interanual y detalle por organización/CECO.
*Orden ajustado:* el **núcleo financiero** (obligaciones, movimientos, pagos, imputaciones) se adelanta
desde la Etapa 5 porque confirmar una renovación o un endoso genera primas por pagar.

### Etapa 4 — Siniestros
Flujos y etapas configurables, expedientes con varios afectados, siniestros de vehículos, personas
(con confidencialidad), propiedades y transporte contratado, importes con historial, límites de
riesgos diversos con alerta, cuentas por cobrar de reembolso, actuaciones y documentos requeridos.

### Etapa 5 — Finanzas completas, indicadores y reportes
Ajustes y anulaciones autorizadas, vistas de saldos, tablero gerencial (personas, activos, pólizas,
primas, finanzas, siniestros), reportes con filtros combinados en la URL, Excel, PDF/impresión.

### Etapa 6 — Despliegue e instalación
Demo en Vercel + Neon, guía de instalación en intranet (Node 22, servicio, carpeta compartida,
variables), respaldo y restauración (`pg_dump`/`pg_restore` + archivos), verificación de migraciones
sobre base nueva.

Cada etapa termina con: funcionalidades, archivos, migraciones, pruebas y resultados, decisiones
pendientes, cómo comprobarlo y siguiente paso.

## 4. Pruebas

- **Lógica pura** (`npm test`): expresiones y faltantes, redondeo, prorrateos, elegibilidad de
  renovación, saldos con pagos parciales, límites disponibles, vigencias sin solape, alcance por empresa,
  enmascarado de datos personales, filtros de reportes, detección de tipo de archivo.
- **Base de datos** (`npm run test:bd`, PostgreSQL desechable; en CI con un contenedor de servicio):
  migraciones sobre base nueva, restricciones (`num_nonnulls`, `EXCLUDE`, llaves), los 21 casos del
  requerimiento con datos sintéticos (persona con varias pólizas, póliza con varias personas, socio y
  asegurado, cambio de asegurado sin perder histórico, venta y exclusión, pagos parciales, separación
  de empresas, acceso no autorizado, etc.), y que los reportes cuadren con los movimientos.
- **Almacenamiento**: el mismo juego de pruebas corre contra el adaptador de carpeta (directorio
  temporal) y el de nube (doble en memoria con la misma interfaz; contra el proveedor real solo en la demo).
- **Punta a punta** (Playwright): login, flujo de cada módulo, usuario sin permiso, teléfono, oscuro.

## 5. Riesgos técnicos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Reglas contractuales sin confirmar (fórmulas, prorrateos, límites) | Motor configurable; bloqueo de confirmación con mensaje de qué falta |
| R2 | Límite de 4,5 MB por petición en Vercel para fotos y documentos | Subida directa firmada al almacenamiento de la demo; validación posterior en el servidor |
| R3 | PostgreSQL del cliente sin `btree_gist`/`pg_trgm` o versión antigua | Preguntar (16); alternativa con disparadores para solapes y búsqueda `ILIKE` |
| R4 | Fuga entre empresas por una consulta que olvide el filtro | Alcance obligatorio en la DAL, pruebas de separación por módulo; evaluar RLS como segunda capa |
| R5 | Errores de redondeo en primas | `numeric` en BD y `decimal.js` en el servidor; nunca `float` para dinero |
| R6 | Complejidad de la renovación con muchos activos | Asistente por pasos que trabaja sobre un período en borrador; confirmación en una transacción |
| R7 | Datos personales en la demo | Solo datos sintéticos; la semilla nunca toma datos reales |
| R8 | Base privada de la intranet no accesible desde Vercel | Dos instalaciones independientes; nunca se asume conexión entre ellas |
| R9 | Calidad de datos de los Excel históricos | Cargador con validación y reporte de rechazos antes de importar |

## 6. Archivos

**Se copian de `iancarina-dpto-legal` y se adaptan** (departamento → empresa, esquema `dl_web` → `cys`):
`lib/auth/{sesion,dal,permisos,areas-visibles}.ts`, `lib/usuarios/*`, `lib/ajustes.ts`,
`lib/auditoria.ts`, `lib/tiempo.ts`, `lib/entorno.ts`, `lib/tema.ts`, `lib/csv.ts`, `lib/formato.ts`,
`lib/cn.ts`, `lib/archivos/rutas.ts` (detección de tipo por contenido), `lib/ayuda/`,
`components/{ui,formularios,reportes,sistema,ayuda,usuarios,ajustes,auth}/`, `app/layout.tsx`,
`app/globals.css`, `app/(publico)/`, `proxy.ts`, `scripts/{migrar,preparar-demo,vercel-build,usuario-soporte}.ts`,
`db/migraciones/001..004` (como base de `001_sistema_base.sql`), configuración de Next, ESLint,
TypeScript y Prisma.

**Se crean**: `lib/almacen/{almacen,carpeta,nube}.ts`, `lib/dominio/**` (cálculo, prorrateo,
vigencias, elegibilidad, saldos, límites, flujos), `lib/datos/**`, `actions/**` por dominio, las rutas
de §2, migraciones `002_partes_y_activos`, `003_catalogos`, `004_polizas`, `005_calculo`,
`006_finanzas`, `007_siniestros`, `008_vistas_reportes` (cada una con rollback), `db/semillas/demo.sql`,
`tests/**`, `docs/modulos/*.md`, `docs/DESPLIEGUE.md`, `docs/INSTALACION-INTRANET.md`.

**No se modifica** ningún archivo de los repositorios modelo.
