@AGENTS.md

# Control de Seguros y Activos — <CLIENTE por confirmar: ¿Mary Iancarina, C.A.?>

Sistema web para centralizar personas (socios, propietarios, asegurados), vehículos, propiedades,
pólizas con sus vigencias, certificados y coberturas, renovaciones, siniestros, pagos de primas y
cuentas por cobrar a las aseguradoras, con indicadores y reportes.
**No reemplaza una aplicación de Access** (por confirmar: hoy se lleva en Excel). La base es nueva:
PostgreSQL propio (Neon para la demo, servidor del cliente en producción).
Mismo stack, método y estilo que `iancarina-planta-maiz` e `iancarina-dpto-legal` (proyectos modelo,
solo de referencia: no se modifican desde este proyecto).

- Cliente y protagonista visual: **<CLIENTE>**. Logo oficial en `public/marca/`.
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

- Esquema **`cys`** (por confirmar el nombre). Tablas del sistema base con prefijo `app_`; tablas del
  dominio sin prefijo. Migraciones SQL versionadas en `db/migraciones/NNN_*.sql` + `.rollback.sql`.
- Llaves foráneas reales desde el primer día (la base es nueva). Nada de relaciones polimórficas
  «tipo + id»: se usan columnas de llave excluyentes con `CHECK (num_nonnulls(...) = 1)`.
- Nunca se borran registros de negocio: se dan de baja, se anulan con un movimiento inverso o se
  fusionan (personas duplicadas). Los períodos confirmados de una póliza no se editan: se endosan.
- Importes `numeric(18,2)` (tasas `numeric(18,8)`) y siempre con su moneda; nunca se convierten
  monedas solas.

## Reglas transversales

- Commits y pull requests **sin** líneas de atribución (nada de «Co-Authored-By», «Claude-Session» ni
  «Generated with…»): el autor es GCH Solutions. Al entregar al cliente se publica un repositorio
  limpio sin `CLAUDE.md`, `AGENTS.md` ni `.claude/`.
- Datos reales del cliente solo en su servidor. Vercel/Neon y el desarrollo usan datos sintéticos
  marcados como tales (`db/semillas/demo.sql`). Nunca se suben respaldos con datos.
- **No se inventan** importes, coberturas, fórmulas, tasas, límites ni beneficiarios: todo se configura.
  Si falta una regla obligatoria, el cálculo queda como simulación y la confirmación financiera se bloquea
  con un mensaje que dice qué falta.
- Toda escritura: sesión → permiso **en la empresa** del registro → Zod → transacción con bitácora.
- Ante una duda de negocio, **preguntar antes** de construir.

## Estado del proyecto

- [x] Etapa 1: auditoría y diseño (`docs/PLAN.md`, `docs/MODELO-DATOS.md`, `docs/REGLAS-Y-PENDIENTES.md`)
- [ ] Etapa 2: núcleo (base del sistema, empresas, personas, relaciones, vehículos, propiedades, catálogos, documentos, auditoría)
- [ ] Etapa 3: pólizas, motor de cálculo, renovaciones, altas/bajas, núcleo financiero de primas
- [ ] Etapa 4: siniestros
- [ ] Etapa 5: finanzas completas, indicadores y reportes
- [ ] Etapa 6: despliegue dual e instalación

## Pendiente de confirmar con el cliente

Ver `docs/REGLAS-Y-PENDIENTES.md` (preguntas numeradas).
