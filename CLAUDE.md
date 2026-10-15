@AGENTS.md

# Control de Seguros y Activos — Mary Iancarina, C.A.

Sistema web para centralizar personas (asegurados, beneficiarios, propietarios), vehículos, propiedades,
pólizas con sus vigencias, certificados y coberturas, renovaciones, siniestros, pagos de primas y
cuentas por cobrar a las aseguradoras, con indicadores y reportes.
Sistema **nuevo** (no reemplaza Access). Base PostgreSQL propia: Neon para la demo, servidor del
cliente en producción. Mismo método y estilo que los proyectos de GCH para Mary Iancarina; la base
del sistema (login, usuarios, ajustes, componentes) se copió de ahí y ya no se necesitan esos repos.

- Cliente y protagonista visual: **Mary Iancarina, C.A.** Logo oficial en `public/marca/`.
- Desarrollado por **GCH Solutions**: solo crédito discreto en el pie.
- Idioma de la interfaz y del código de dominio: **español**.

## Skills del proyecto (léelas antes de trabajar)

- `.claude/skills/access-a-web-gch`: el método completo. Al iniciar, lee `referencias/sistema-base.md`.
  Aquí no hay Access: valen el sistema base, las reglas de datos, el diseño y la forma de trabajo.
- `.claude/skills/stack-nextjs`: stack, estructura y reglas de BD, auth y despliegue.
- `.claude/skills/ui-estandares`: estándares visuales y de código de UI.

## Plan y diseño

- `docs/PLAN.md`: auditoría, etapas, archivos que se reutilizan y riesgos.
- `docs/MODELO-DATOS.md`: modelo relacional, diagramas, cardinalidades e integridad.
- `docs/REGLAS-Y-PENDIENTES.md`: reglas de negocio identificadas y preguntas al cliente.

## Base de datos

- Esquema **`cys`**. Tablas del sistema base con prefijo `app_`; tablas del
  dominio sin prefijo. Migraciones SQL versionadas en `db/migraciones/NNN_*.sql` + `.rollback.sql`.
- Llaves foráneas reales desde el primer día (la base es nueva). Nada de relaciones polimórficas
  «tipo + id»: se usan columnas de llave excluyentes con `CHECK (num_nonnulls(...) = 1)`.
- Nunca se borran registros de negocio: se dan de baja, se anulan con un movimiento inverso o se
  fusionan (personas duplicadas). Los períodos confirmados de una póliza no se editan: se endosan.
- Importes `numeric(18,2)` (tasas `numeric(18,8)`) y siempre con su moneda; nunca se convierten
  monedas solas.

## Usuarios y permisos

- Empresas en `cys.app_empresas` (Administración → Empresas). **Se manejan por separado**: cada usuario
  ve solo las empresas donde tiene rol y toda consulta filtra por ellas.
- Roles por empresa: **Analista** (ve e ingresa) y **Consulta** (solo ve), con `vigente_hasta`
  opcional. Excepciones por empresa: gestionar usuarios, ver datos personales, anular y ajustar.
- Roles globales: administrador (todo) y desarrollador (solo `npm run usuario:soporte`).
- Permisos en `lib/auth/permisos.ts` ⇄ `cys.app_permisos`: `requerirPermiso("seguros.registrar", empresa)`.
- Bitácora `cys.app_bitacora` (no se edita ni se borra; disparador). Nunca se borran usuarios ni empresas.
- Primer administrador: variables `ADMIN_INICIAL_*` en el despliegue (`docs/DESPLIEGUE.md`).

## Reglas transversales

- Commits y pull requests **sin** líneas de atribución (nada de «Co-Authored-By», «Claude-Session» ni
  «Generated with…»): el autor es GCH Solutions. Al entregar al cliente se publica un repositorio
  limpio sin `CLAUDE.md`, `AGENTS.md` ni `.claude/`.
- Datos reales del cliente solo en su servidor. Vercel/Neon y el desarrollo usan datos sintéticos
  marcados como tales (`db/semillas/demo.sql`). Nunca se suben respaldos con datos.
- **No se inventan** importes, coberturas ni beneficiarios. Las tasas, fórmulas y prorrateos parten de la
  propuesta base de mercado (`docs/REGLAS-Y-PENDIENTES.md` §2, autorizada por GCH), cargada como reglas
  configurables marcadas «Propuesta». Si falta un parámetro, el cálculo queda como simulación y la
  confirmación financiera se bloquea con un mensaje que dice qué falta.
- Toda escritura: sesión → permiso **en la empresa** del registro → Zod → transacción con bitácora
  (`registrarGestion(..., { empresa, entidad, idRegistro, operacion })` alimenta el «Historial» de cada ficha).
- Formularios: `components/formularios/formulario-accion.tsx` (errores por campo, no reinicia lo escrito).
- Archivos: `guardarArchivo()` y `/archivos/<id>`; nunca rutas del navegador ni contenido en la base.
- Pruebas: `npm test` (lógica) y `npm run test:bd` (base nueva + restricciones; `DATABASE_URL_PRUEBAS`).
- Ante una duda de negocio, **preguntar antes** de construir.

## Estado del proyecto

- [x] Etapa 1: auditoría y diseño (`docs/PLAN.md`, `docs/MODELO-DATOS.md`, `docs/REGLAS-Y-PENDIENTES.md`)
- [x] Base del sistema: login, empresas, usuarios con rol por empresa (analista/consulta), ajustes,
      menú por áreas, bitácora inmutable, tema, despliegue en Vercel + Neon (`docs/DESPLIEGUE.md`)
- [x] Etapa 2: personas y empresas (`docs/modulos/personas.md`; sin socios ni acciones), vehículos y propiedades con
      titulares y bajas, documentos y fotos en Blob privado / carpeta (`docs/modulos/activos.md`), catálogos
- [ ] Etapa 2b: consolidar personas duplicadas (fusión) — cuando haya pólizas que reapuntar
- [ ] Etapa 3: pólizas, motor de cálculo, renovaciones, altas/bajas, núcleo financiero de primas
- [ ] Etapa 4: siniestros
- [ ] Etapa 5: finanzas completas, indicadores y reportes
- [ ] Etapa 6: despliegue dual e instalación

## Flujo de publicación

- Cada entrega: rama de trabajo → PR a `main` → merge (Vercel publica la demo y migra Neon solo).

## Pendiente de confirmar con el cliente

Ver `docs/REGLAS-Y-PENDIENTES.md` (preguntas numeradas).
