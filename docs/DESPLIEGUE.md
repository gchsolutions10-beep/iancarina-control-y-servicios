# Publicar la demo en Vercel + Neon

No hace falta descargar nada ni correr comandos en tu computadora: **cada despliegue de Vercel crea
o actualiza las tablas en Neon solo** (`vercel-build` = `scripts/vercel-build.ts`: aplica las
migraciones pendientes, carga los datos de demostración si `PREPARAR_DEMO=true` y crea el primer
administrador).

## 1. Neon (base de datos)

1. Entra a https://console.neon.tech → **New Project**.
   - Nombre: `control-seguros` · PostgreSQL **16** · Región: la más cercana (p. ej. *AWS US East*).
2. En **Dashboard → Connect**, copia dos cadenas:
   - **Pooled** (el host tiene `-pooler`): será `DATABASE_URL`.
   - **Direct** (desactiva «Connection pooling»): será `DATABASE_URL_MIGRACIONES`.

> Atajo: en Vercel, **Storage → Neon** crea la base y llena `DATABASE_URL` sola. Igual agrega
> `DATABASE_URL_MIGRACIONES` con la cadena directa.

## 2. Vercel (aplicación)

1. https://vercel.com/new → **Import** el repositorio `iancarina-control-y-servicios`.
2. Framework: **Next.js** (lo detecta). No cambies los comandos: Vercel usa `vercel-build`.
3. **Production Branch**: `main` (Settings → Environments → Production).
4. **Environment Variables** (Settings → Environment Variables), para *Production* y *Preview*:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | cadena **pooled** de Neon |
| `DATABASE_URL_MIGRACIONES` | cadena **directa** de Neon |
| `SESSION_SECRET` | texto aleatorio de 48+ caracteres (ver abajo) |
| `SESSION_COOKIE_SECURE` | `true` |
| `SESSION_HORAS` | `12` |
| `ZONA_HORARIA` | `America/Caracas` |
| `PREPARAR_DEMO` | `true` (solo en la demo) |
| `ADMIN_INICIAL_USUARIO` | tu usuario de administrador (ej. `gch.admin`) |
| `ADMIN_INICIAL_CLAVE` | clave de 10+ caracteres con letras y números |

   Para `SESSION_SECRET` usa un generador de contraseñas de 64 caracteres, o en cualquier terminal:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
   **Documentos y fotos:** Vercel → **Storage → Create → Blob**, acceso **Private**, y conéctalo al
   proyecto: Vercel crea `BLOB_READ_WRITE_TOKEN` solo. Vuelve a desplegar después de conectarlo.
   Sin ese almacenamiento el sistema funciona, pero avisa que la carga de archivos no está configurada.
5. **Deploy**. En el registro del build debes ver:
   `→ Aplicando 001_sistema_base.sql` · `✓ Base de datos al día` · `✓ Administrador inicial «…» creado`.
6. Entra a la URL de Vercel con el administrador. Después del primer ingreso puedes borrar
   `ADMIN_INICIAL_USUARIO` y `ADMIN_INICIAL_CLAVE` (si quedan, no pasa nada: el usuario ya existe
   y no se modifica).

## 3. Probar

1. **Empresas**: hay dos de demostración. Crea las reales del grupo cuando quieras.
2. **Usuarios → Nuevo usuario**: una analista con rol *Analista* en una empresa y otra con *Consulta*.
3. Entra con cada una (pedirá cambiar la clave temporal) y comprueba que solo ve lo suyo.

## 4. Cada entrega

Rama de trabajo → PR a `main` → merge. Vercel publica solo y aplica las migraciones nuevas.
Las ramas que no son `main` generan una *Preview*; si comparten la base, también la migran. Para
aislarlas, crea en Neon una rama `pruebas` y pon su cadena en las variables de *Preview*.

## 5. Producción en la intranet (Etapa 6)

Node 22 LTS, PostgreSQL del cliente, `npm ci && npm run db:migrar && npm run build && npm start`,
mismas variables (sin `PREPARAR_DEMO`; `SESSION_COOKIE_SECURE=false` si no hay HTTPS), más
`ALMACEN=carpeta` y `ARCHIVOS_RUTA_BASE` (carpeta compartida montada en el servidor, con permiso de
lectura y escritura para el usuario del servicio).
