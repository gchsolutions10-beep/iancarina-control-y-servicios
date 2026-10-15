---
name: stack-nextjs
description: Stack y convenciones de arquitectura de GCH Solutions para sistemas empresariales (Next.js 16 App Router, React 19, Tailwind v4, Prisma 7 + PostgreSQL, auth con jose, Zod). Úsala al crear rutas, server actions, consultas a BD, autenticación, permisos o despliegue.
---

# Stack GCH Solutions — Next.js 16 + PostgreSQL

## Versiones de referencia

| Pieza | Versión | Nota |
|---|---|---|
| Next.js | 16.x App Router | `middleware.ts` ahora se llama **`proxy.ts`** |
| React | 19.x | `useActionState`, `use()` |
| Tailwind | 4.x | `@import "tailwindcss";` + `@theme` en `app/globals.css`, sin `tailwind.config` |
| Prisma | 7.x | `prisma.config.ts` + driver adapter `@prisma/adapter-pg`; cliente generado en `lib/generated/prisma` |
| Zod | 4.x | Un esquema por formulario, compartido cliente/servidor |
| Auth | `jose` (JWT HS256) en cookie HttpOnly + `bcryptjs` | Sin proveedores externos: debe funcionar en intranet |

> Antes de usar una API de Next que no conozcas, lee `node_modules/next/dist/docs/`.
> Esta versión cambió mucho respecto a lo que pudiste aprender.

## Estructura de carpetas

```
app/
  (publico)/         rutas sin sesión (portada/login, indicadores públicos)
  (sistema)/         rutas con sesión; el layout valida la sesión con la DAL
  globals.css        tokens de diseño (@theme)
actions/             server actions ("use server"), una por dominio
components/
  ui/                primitivas (Boton, Campo, Tarjeta, Insignia…)
  <dominio>/         componentes de negocio
lib/
  auth/              sesion.ts (JWT, apto para proxy) · dal.ts (server-only) · permisos.ts
  db.ts              singleton de Prisma
  validations/       esquemas Zod
  generated/prisma   (generado, no se versiona)
db/
  00_esquema_original_*.sql   dump de referencia del cliente
  migraciones/NNN_nombre.sql  cambios SQL versionados (+ .rollback.sql)
  semillas/demo.sql           datos de demo (nunca en producción)
scripts/             migrar.ts, utilidades de administración
proxy.ts             protección gruesa de rutas (solo verifica la cookie)
```

## Reglas de arquitectura

1. **Base de datos existente manda.** No se renombra ni se borra nada del cliente.
   Las tablas nuevas de la app llevan prefijo `app_`. Todo cambio va en
   `db/migraciones/NNN_*.sql` idempotente, con su `.rollback.sql`, y se aplica con
   `npm run db:migrar`. Después: `npm run db:introspeccion && npm run db:generar`.
   No usamos `prisma migrate` (la BD no nació con Prisma).
2. **Seguridad en capas.** `proxy.ts` solo redirige si no hay cookie válida. La
   autorización real está en la **DAL** (`lib/auth/dal.ts`): cada página, server action
   y route handler llama a `requerirSesion()` / `requerirPermiso()`, que relee el usuario
   y sus permisos desde la BD (un usuario bloqueado pierde acceso al instante).
3. **Permisos por código** (`'empaque.registrar'`), nunca por nombre de rol. El
   catálogo vive en `lib/auth/permisos.ts` y en la tabla `app_permisos`; deben coincidir.
4. **Vistas SQL** se consultan con `$queryRaw` (tagged template, nunca concatenando
   strings) y el resultado se valida con Zod. Castea `numeric` a `float8` en SQL.
5. **Server Actions** devuelven `{ ok: true, ... } | { ok: false, error, campos? }`;
   nunca lanzan errores al cliente para validaciones.
6. **Sin `cacheComponents`.** Los datos deben verse en vivo; las páginas que
   consultan la BD sin leer cookies declaran `export const dynamic = "force-dynamic"`.
7. **Auditoría:** todo registro guarda `fecha_gestion` e `id_gestion` (= `id_usuario`),
   y las acciones relevantes escriben en la tabla de bitácora del cliente. Las columnas
   `timestamp without time zone` heredadas se llenan con la hora de pared de la empresa
   (`lib/tiempo.ts`, `ZONA_HORARIA`; en los proyectos Mary: `ahoraPlanta()` / `hoyPlanta()`),
   nunca con `new Date()` sin zona; la bitácora se escribe con
   `registrarGestion()` (`lib/auditoria.ts`). Las fechas de negocio viajan como 'AAAA-MM-DD'.
8. **Reglas de edición** (si el proyecto las tiene): toda acción que crea, modifica o elimina
   registros evalúa `evaluarEdicion()` (`lib/reglas-edicion.ts`).
9. **Parámetros en Ajustes** (`lib/ajustes.ts` ⇄ `app_ajustes`), archivos con `guardarArchivo()` y
   `/archivos/<origen>/<id>`, avisos como fuentes en `lib/avisos/`: ver la referencia
   `access-a-web-gch/referencias/sistema-base.md`.
10. Después de crear una ruta, `npx next typegen` (lo hace `npm run typecheck`); después de
    `prisma generate`, reiniciar `next dev`.

## Despliegue dual

- **Demo / venta:** Vercel + Neon. `DATABASE_URL` = cadena *pooled* de Neon,
  `SESSION_COOKIE_SECURE=true`.
- **Producción en intranet:** servidor del cliente con Node 22 LTS, `npm ci && npm run
  build && npm start` (o PM2 / servicio de Windows), `DATABASE_URL` al PostgreSQL local.
- El mismo código sirve para ambos: todo lo que cambia está en `.env`.

## Comandos

```
npm run dev | build | start | lint | typecheck | test
npm run db:migrar [-- --semilla]   aplica migraciones (y datos demo)
npm run db:preparar-demo           base de demostración (Vercel + Neon)
npm run db:introspeccion           prisma db pull
npm run db:generar                 prisma generate
npm run usuario:soporte -- <usuario> <clave>   cuenta técnica de GCH (administrador + desarrollador)
```

`vercel-build` (`scripts/vercel-build.ts`) aplica las migraciones antes de `next build`.
