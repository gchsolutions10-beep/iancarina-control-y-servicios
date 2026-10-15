# Base de datos: Access y web sobre el mismo PostgreSQL

## Cómo viene la base de Access

- Access usa tablas vinculadas por ODBC a un esquema de PostgreSQL (ej. `pp_pm`). En Access se ven
  como `pp_pm_tabla`; en PostgreSQL, `pp_pm.tabla`.
- **No trae llaves foráneas**: las relaciones son implícitas (`id_turno`, `id_silo`, `id_linea`…).
- Catálogos: tablas `list_*` (turnos, silos, plantas, líneas, máquinas…) y una tabla genérica de
  listas por módulo (ej. `set(id, modulo, valor, mostrar)` con EMPRESAS, TOLVAS, TIPO RECEPCION…).
- Vistas de reportes `vw_*` / `wv_*` con columnas en MAYÚSCULAS y espacios (`"KG NETO"`): se leen
  con `$queryRaw` y se validan con Zod; casteos `::float8` para números.
- Bitácora `tgesth(id_usuario_gestion, fecha_gestion, modulo, descripcion)`; formato de Access
  (`AuditoriaGlobal`): `ID 57 | [campo]: 'antes' -> 'después'; `. Eliminaciones: módulo
  `DELETE_<MÓDULO>` con una copia de los datos.
- Usuarios: tabla maestra de Access con banderas de perfil (`p_admin`, `p_calidad`…) y plantas
  (`a_p1..a_p6`), clave en texto plano. La web agrega `app_usuarios` (hash bcrypt) y sincroniza
  roles desde las banderas en cada inicio de sesión. Nunca se borran usuarios: se bloquean.
- Cada registro tiene `fecha_gestion` (último cambio) e `id_gestion` (quién). Access sobrescribe el
  autor en cada guardado; la web conserva al **primer** autor y deja los cambios en la bitácora.
- **Horarios automáticos:** `list_horarios_aut(proceso, horario, id_turno, crear, tipo_dia)` define
  las filas que se crean solas al abrir una fecha (controles por hora). Algunos procesos usan
  `horario` para otra cosa (ej. nombres de línea en «LINEAS A CREAR EN …»).
- Fecha de producción: el día cambia a una hora de corte (ej. 08:00); antes de esa hora se sigue
  cargando el día anterior. Toda fecha de negocio en la zona horaria de la planta.
- Los porcentajes se guardan como **fracción** (12,5 % = 0.125); en pantalla se escriben de 0 a 100.

## Varios esquemas (caso Legal)

- Un sistema puede juntar varias aplicaciones de Access, cada una con su esquema (`dl_mrcs`,
  `dl_cmplc`…). Hay un dump de referencia por esquema: `db/00_esquema_original_<esquema>.sql`.
- Las tablas propias de la web van en un **esquema aparte** (`dl_web`), con prefijo `app_`.
- Si dos esquemas tienen tablas con el mismo nombre, Prisma las llama `<esquema>_<tabla>`
  (`dl_mrcs_expedientes`) con `@@map`.
- Los índices nuevos sobre tablas de Access se permiten, porque solo agregan: van con nombre
  `app_*` y su rollback.
- Las tablas de usuarios de cada Access no se tocan. Los usuarios se unifican en la web (ver
  `sistema-base.md`).

## Esquema de referencia

- `db/00_esquema_original_<esquema>.sql`: dump de estructura del cliente. Si la base real del cliente
  difiere (tipos cambiados después de implementar), se alinea este archivo **y** se agrega una
  migración condicional (solo cambia si la columna todavía tiene el tipo viejo).
- El cargador de copias crea el esquema desde ese archivo y luego carga los datos: si el tipo no
  coincide con los datos reales, la carga falla. Mantenerlo alineado.

## Migraciones

- Carpeta `db/migraciones/NNN_nombre.sql` + `NNN_nombre.rollback.sql`. Tabla de control
  `app_migraciones(nombre, checksum)`. Se aplican en orden, una vez, con candado de transacción
  (`pg_advisory_xact_lock`, `SET LOCAL lock_timeout`); nunca candados de sesión (se quedan pegados
  detrás de poolers como pgbouncer/Neon). Se corren solas en el build de despliegue.
- Una migración aplicada no se edita: si cambia, el script avisa y no la reaplica. Se crea otra.
- **Llaves foráneas** módulo por módulo, sin bloquear la tabla y sin romper Access:
  ```sql
  ALTER TABLE t ADD CONSTRAINT t_col_fkey FOREIGN KEY (col) REFERENCES list_x (id) NOT VALID;
  BEGIN ALTER TABLE t VALIDATE CONSTRAINT t_col_fkey;
  EXCEPTION WHEN foreign_key_violation THEN RAISE WARNING '... queda NOT VALID'; END;
  ```
  Antes, un diagnóstico (`db/diagnosticos/<tabla>.sql`): referencias rotas, duplicados, nulos.
- **Unicidad** de filas automáticas: índice único parcial `(fecha, hora[, linea]) WHERE fecha IS NOT
  NULL AND hora IS NOT NULL`. Si hay duplicados, borrar solo las copias **vacías** (con bitácora).
- `ON DELETE CASCADE` solo cuando el hijo no tiene sentido sin el padre (ej. el análisis de Calidad de
  un ingreso), y además borrarlo explícitamente en la acción para dejar copia en la bitácora.

## Correcciones de datos (errores de digitación)

- Se proponen con evidencia (valor raro frente a la mediana y a los vecinos del mismo registro) y se
  aplican **solo con autorización** del cliente.
- Se escriben como migración que identifica por **valor**, no por id (ej. `WHERE porcentaje > 1`,
  `WHERE espesor >= 10`, `WHERE silo = '503502'`): si se vuelve a cargar una copia de Access antes
  del corte, la corrección se aplica sola otra vez.
- Cada cambio queda en `tgesth` con módulo `CORRECCION DE DATOS NNN` y el valor anterior.
- Patrones típicos: porcentaje escrito sin dividir (12,4 → 1240 %: dividir entre 100), número sin
  coma (64 → 0,64), año mal escrito (2032 por 2026: **preguntar**, comparar con `fecha_gestion`),
  silos sin guion. Si no hay forma segura de corregir: dejar vacío («mejor vacío que un dato
  imposible»), con autorización.

## Copias y entornos

- Producción y pruebas en ramas separadas de la base (ej. Neon `main` y `pruebas`).
- Copias entre bases con `pg_dump`/`pg_restore` + script de comparación de conteos, o desde Access
  con un exportador VBA a CSV + cargador (`--reemplazar` recrea el esquema en una transacción).
- Una cuenta técnica de soporte se crea por script después de cada carga.
- Nunca pedir contraseñas o tokens por chat: se escriben en el script o en la configuración.
