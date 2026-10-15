# Sistema base: lo que todo proyecto trae desde el primer día

Salió de Planta Maíz y se completó en Departamento Legal. Antes del primer formulario se arma esta
base y luego cada módulo la reutiliza. Las rutas citan los archivos de Legal
(`gchsolutions10-beep/iancarina-dpto-legal`), que es el ejemplo más completo.

## 1. Usuarios y permisos

- **Una sola tabla web** de usuarios (`<esquema_web>.app_usuarios`, hash bcrypt). Las tablas de
  usuarios de Access no se tocan. La relación con ellas va en `app_usuario_origen` (sistema + id de
  Access → usuario web) y sirve para la autoría del histórico.
  Si Access sigue vivo (convivencia, como en Planta Maíz), en cada inicio de sesión se sincronizan
  roles desde las banderas legacy. Si Access se retira al arrancar la web (como en Legal), la web es
  la maestra.
- **Roles globales**: administrador (todo), director (todas las áreas) y desarrollador (solo lo da
  `npm run usuario:soporte`, consola técnica).
- **Rol por área o departamento**: gerente, coordinador, analista y consulta (solo ver), con
  `vigente_hasta` opcional para coberturas. Hay **permisos excepcionales** por área
  (`app_usuario_permisos`).
- **Permisos por código** en `lib/auth/permisos.ts` ⇄ tabla `app_permisos`. Un módulo exige su
  permiso **en su área**: `requerirPermiso("marcas.ver", "corporativo")`. Las reglas de quién
  gestiona a quién viven en `lib/usuarios/alcance.ts`, como lógica pura con pruebas.
- Nunca se borran usuarios: se bloquean. Hay claves temporales, «Mi clave» y una bitácora web
  (`app_bitacora`) con el mismo formato que `tgesth`.
- La cuenta técnica de GCH se crea con `npm run usuario:soporte -- <usuario> <clave>`. Nunca se
  piden claves por chat.

## 2. Navegación

- Una pestaña por área (`/corporativo`, `/compliance`…) que solo aparece si el usuario tiene acceso.
  El menú se arma desde `lib/modulos.ts`: id, nombre, descripción, icono, permiso, origen (tabla o
  vista) y ruta. Un módulo sin `ruta` aparece como «próximamente».
- Portada con login; «Inicio», «Volver», tema claro/oscuro/sistema (claro por defecto) y «Mi clave».
- Botón «i» con la guía de cada módulo (`lib/ayuda/guias.ts`, mismo id que en el menú) y «Mi manual».
  `tests/guias.test.ts` falla si un módulo publicado no tiene guía.

## 3. Ajustes (`/ajustes`)

- Todo parámetro que pueda cambiar (plazos, días de aviso, carpetas, interruptores) va en
  `lib/ajustes.ts` ⇄ `app_ajustes` (valor **jsonb**: en SQL, `'""'` para texto vacío y `'60'` para
  números). Cada ajuste define grupo, título, detalle, esquema Zod, valor por defecto y **quién lo
  edita**: el administrador (`admin.sistema`) o solo el desarrollador.
- Nunca dejar constantes sueltas en el código para estas cosas.

## 4. Archivos

- Se suben con `guardarArchivo(file, { modulo, grupo, usuario, carpeta? })` y se abren con
  `/archivos/<origen>/<id>` (`lib/archivos/`). El navegador solo envía el tipo y el id: la ruta se lee
  de la BD y nunca se usa una ruta que mande el navegador.
- El tipo real se valida por los primeros bytes (PDF, imágenes, Office). Nunca se sobrescribe un
  archivo: se agrega «(2)», «(3)». Cada apertura de un documento queda en la bitácora.
- Las rutas de Access (`\\SERVIDOR\carpeta\x.pdf`, `P:\x.pdf` o relativas a una carpeta base) se
  traducen con raíces configuradas en Ajustes (carpeta compartida + letras de unidad). Si Access
  guardaba rutas relativas o «rescataba» rutas viejas, se replica igual (ver
  `rutasDocumentoExpediente`).
- **Demo** (Vercel, `PREPARAR_DEMO=true`, sin carpeta configurada): los archivos se guardan en la BD
  (`app_archivos`, «web:<id>/<nombre>»). El máximo es de 4 MB por el límite de Vercel.

## 5. Avisos (campana)

- Cada sistema con avisos es una **fuente** en `lib/avisos/recordatorios.ts`:
  `{ tipo: "alertas" | "aprobaciones", origen, departamento, permiso, consultar() }`.
- Un aviso le llega a un usuario solo si marcó la casilla de ese tipo («Recibe notificaciones de
  alertas / aprobaciones») **y** tiene el permiso del módulo **en esa área** (un aviso de Compliance
  nunca le llega a alguien de Corporativo).
- La campana se abre sola al entrar si hay pendientes. Puede usar notificaciones del navegador
  mientras la web esté abierta. Se consulta cada 5 minutos y al volver a la pestaña.
- Vencimientos: avisar lo que vence dentro del plazo de Ajustes **y** lo vencido en ese mismo plazo
  hacia atrás, para que no se acumulen avisos de hace años.

## 6. Reportes y listados

- Los filtros van en la URL (`?q=&empresa=&pagina=`), así se pueden compartir y «Volver» los
  conserva. Se usan `leerFiltrosX(searchParams)`, `aConsulta(filtros, cambios)` y
  `filtrosActivos()` para las etiquetas que se quitan con una «x».
- Componentes en `components/reportes/`: formulario de filtros que se aplica solo, etiquetas,
  paginación, botón **Excel** (CSV con «;», coma decimal y BOM UTF-8, con los mismos filtros) e
  **«Imprimir o PDF»** (`?imprimir=1` trae todas las filas y abre el diálogo de impresión).
- Hay **tarjetas de control** arriba (vencidos, por vencer, vigentes…). Cada una filtra el listado y
  se vuelve a pulsar para quitar el filtro. Cuentan con los demás filtros aplicados.
- Los estados (vigente, por vencer, vencido) se muestran con insignias que llevan **ícono y
  texto**, nunca solo color.

## 7. Portal público (cuando se pide «sin usuario»)

- Va en `app/(publico)/portal`, sin sesión, con datos mínimos y búsqueda **exacta** (por RIF).
  Para seguir un trámite se piden dos datos (número + RIF). Tiene freno por IP
  (`lib/compliance/limite.ts`) y un ajuste para apagarlo.
- Lo que escribe el portal queda con autor `null` y los datos del solicitante en una tabla web.

## 8. Datos de demostración y despliegue

- `db/semillas/demo.sql` está hecho de bloques `DO $$ … $$` que se cargan solo si su tabla está
  vacía, con fechas relativas a `CURRENT_DATE` (siempre hay vencidos, por vencer y vigentes). Los
  bloques nuevos se agregan al final y nunca se cargan sobre datos reales.
- Vercel + Neon: `vercel-build` aplica las migraciones (y prepara la demo si es la base de demo)
  antes de `next build`. Producción en el servidor del cliente: Node 22, `npm ci && npm run build &&
  npm start`. **Nunca** se suben datos reales del cliente a Vercel o Neon, ni respaldos al
  repositorio.

## 9. Forma de trabajo con el usuario

- Todo en **español**. Se pregunta antes de construir si hay dudas de negocio: todas juntas,
  numeradas, con opciones.
- Cada entrega va así: rama de trabajo → commit → PR a `main` → merge (Vercel publica). Esto se
  repite hasta que el cliente diga que el sistema está en producción.
- **Commits y PR sin líneas de atribución** («Co-Authored-By», «Generated with…»): el autor es GCH
  Solutions. Al entregar al cliente se publica un repositorio limpio sin `CLAUDE.md`, `AGENTS.md`
  ni `.claude/`.
- Al terminar, un resumen corto: qué hay, cómo se probó, qué decisiones se tomaron sin preguntar y
  qué falta configurar.

## 10. Trampas conocidas (Next 16 / React 19 / Prisma 7)

- `middleware.ts` ahora se llama `proxy.ts`. `PageProps<"/ruta">` necesita `npx next typegen` después
  de crear una ruta (`npm run typecheck` ya lo incluye).
- React 19 reinicia el `<form>` tras una acción: los formularios con `<select>` controlados se envían
  con `enviarSinReiniciar(accion)`, que también pasa el botón que envió (`name`/`value`).
- Después de `prisma generate` hay que reiniciar `next dev` (si no, sigue el cliente viejo).
- Un archivo `"use server"` solo exporta funciones async: las utilidades compartidas van en `lib/`.
- No correr Prettier si el repositorio no lo tiene configurado, porque reformatea todo.
- Las advertencias de hidratación en Playwright con capturas de pantalla las causa el cursor que
  inyecta la captura. Hay que comprobar sin capturas antes de buscar el error.
- Las pruebas de punta a punta se hacen con Playwright (Chromium ya instalado) contra `next dev`.
  Se cubren login, el flujo completo, Excel, un usuario sin permiso, el teléfono y el modo oscuro.
