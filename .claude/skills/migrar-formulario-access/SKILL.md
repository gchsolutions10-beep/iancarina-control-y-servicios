---
name: migrar-formulario-access
description: Procedimiento para migrar un formulario o reporte de Microsoft Access (capturas, macros, VBA) a un módulo Next.js sobre la misma tabla PostgreSQL. Úsala cuando el usuario comparta pantallas, macros o funciones de Access y pida construir el módulo equivalente.
---

# Migrar un formulario de Access a un módulo web

El objetivo **no** es copiar Access pixel por pixel: es conservar la lógica de negocio
y los datos, con una experiencia moderna (ver skill `ui-estandares`).

## 1. Entender antes de escribir

Con las capturas/macros que comparta el usuario, identifica y anota:

- **Tabla destino** y **vista de consulta** (buscar en `db/00_esquema_original_*.sql`).
- Cada **campo** del formulario → columna, tipo, obligatoriedad, valores por defecto.
- **Combos** → tabla catálogo (`list_*`) y filtro (ej. `activo = true`, por planta).
- **Cálculos** de macros/VBA → dónde viven: ¿en una vista SQL (preferido) o en el
  formulario? Si estaban en VBA, proponer moverlos a SQL o a una función TS pura con test.
- **Validaciones** y mensajes de Access → reglas Zod.
- **Permiso** que lo habilita (bandera legacy → código en `lib/auth/permisos.ts`).
- **Relaciones** implícitas → proponer FOREIGN KEY en una migración nueva (verificando
  antes que los datos existentes no la violen: `SELECT ... WHERE NOT EXISTS ...`).

Si algo es ambiguo, **pregunta** antes de construir. Lista las dudas juntas.

Antes de crear llaves foráneas, entrega un script de diagnóstico de solo lectura en
`db/diagnosticos/` (referencias rotas + catálogos) y espera su resultado. Las FKs se crean
`NOT VALID` y luego se intenta `VALIDATE` (ver `003_llaves_ingresos_maiz.sql`).

## 2. Construir (en este orden)

1. `db/migraciones/NNN_<modulo>.sql` (+ `.rollback.sql`) si hacen falta FKs, índices
   o columnas nuevas. Nunca renombrar/borrar columnas que Access usa.
2. `lib/validations/<modulo>.ts` — esquema Zod (coerciones de número/fecha desde
   `FormData`, mensajes en español).
3. `actions/<modulo>.ts` — server actions `crear`, `actualizar`, `eliminar`:
   `requerirPermiso("<modulo>.<accion>", "<area>")` → reglas de edición si el proyecto las tiene
   → validar con Zod → escribir con Prisma en una transacción junto con `registrarGestion()`
   → `revalidatePath`. `fecha_gestion` con la hora de la empresa (`lib/tiempo.ts`).
4. `app/(sistema)/<area>/<modulo>/page.tsx` — listado con filtros en la URL (`searchParams`),
   paginado en servidor, Excel e «Imprimir o PDF» (`components/reportes/`).
5. Formulario de alta/edición (cliente) con `useActionState`, controles de
   `components/formularios/` y envío con `enviarSinReiniciar()`. Una sección por perfil
   (cada una con su propia server action y su propio autor para las reglas de edición).
6. Agregar la `ruta` del módulo en `lib/modulos.ts` (y su tarjeta en otras áreas si otro
   perfil participa, como Calidad en Despachos).
7. Guía «i» en `lib/ayuda/guias.ts` (mismo id) y botón `<AyudaModulo>` junto al título.
8. Si el módulo tiene vencimientos o pendientes: fuente de avisos en `lib/avisos/` y ajuste de días.
9. Datos de demostración: bloque nuevo al final de `db/semillas/demo.sql`.
10. Documentar reglas, diferencias con Access y pendientes en `docs/modulos/<modulo>.md`.

## 3. Verificar

- Cargar datos de prueba y comparar el resultado de la vista SQL con lo que daba Access.
- `npm run typecheck && npm run lint && npm test && npm run build`.
- Prueba de punta a punta con Playwright (flujo completo, Excel, teléfono, modo oscuro).
- Probar con un usuario **sin** el permiso: no debe ver el módulo ni poder invocar la acción.
