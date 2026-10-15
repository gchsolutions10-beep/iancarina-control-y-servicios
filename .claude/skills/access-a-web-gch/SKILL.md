---
name: access-a-web-gch
description: Método completo de GCH Solutions para reemplazar sistemas de Microsoft Access (formularios, macros VBA, reportes) por un sistema web Next.js sobre la MISMA base PostgreSQL, con el patrón de «resultado debajo del formulario» (indicadores, gráficas validadas y tabla). Úsala al iniciar o continuar cualquier proyecto que migre Access a web, cuando el usuario comparta capturas, archivos .cls/.bas, tablas o vistas de Access, o pida un formulario con sus análisis y gráficas.
---

# Access → Web (método GCH Solutions)

Este método salió de «Planta Maíz» y se completó en «Departamento Legal» (los dos para Mary
Iancarina). Se repite en cada sistema de Access que GCH migra. Léelo completo al empezar un
proyecto y consulta las referencias según la tarea.

| Archivo | Cuándo leerlo |
|---|---|
| `referencias/sistema-base.md` | **Al iniciar un proyecto**: usuarios y permisos por área, ajustes, archivos, avisos, reportes, portal, demo, forma de entrega y trampas conocidas |
| `referencias/base-de-datos.md` | Esquema de Access en PostgreSQL, migraciones, llaves, correcciones, bitácora |
| `referencias/formularios.md` | Cómo se replica cada tipo de formulario de Access y sus reglas |
| `referencias/resultados-y-graficos.md` | El patrón «resultado debajo del formulario» (lo que más valora el cliente) |
| `referencias/diseno.md` | Estándar visual, marca, accesibilidad, móvil, modo oscuro |
| `referencias/plantilla-modulo.md` | Lista de archivos y pasos para cada módulo nuevo, con esqueletos de código |

## Principios (no negociables)

1. **Misma base.** Access y la web usan la misma base PostgreSQL. Según el proyecto conviven
   durante la transición (Planta Maíz) o Access se retira al arrancar la web (Legal): confirmarlo
   con el usuario al empezar. **Nunca** se borran ni modifican tablas/columnas que usa Access: solo se agrega
   (tablas `app_*`, índices, llaves `NOT VALID`, vistas nuevas). Una sola base activa a la vez.
2. **Se replica la lógica, no el aspecto.** Cada formulario conserva sus campos, cálculos (macros
   VBA), validaciones, permisos y bitácora; la pantalla se diseña de nuevo, moderna y clara.
3. **Preguntar antes que suponer.** Si no está claro qué se relaciona con qué, quién registra, la
   unidad de un campo o el significado de una sigla: preguntar (todas las dudas juntas) **antes** de
   construir. Nunca relacionar áreas que el cliente no pidió (cada área hace su propio análisis).
4. **Resultado debajo del formulario.** Todo formulario de registro termina con su «resultado del
   día/período»: indicadores, gráficas con colores validados para daltonismo y una tabla con los
   mismos datos. En sistemas de control (vencimientos, trámites), el equivalente son las tarjetas
   de control arriba del listado: vencidos, por vencer, vigentes.
5. **Otra área, debajo.** Si otra área completa datos del mismo registro (ej. Calidad sobre lo que
   cargó Suministro), su sección va **debajo** del formulario principal, en un bloque aparte: así
   revisa primero lo que cargaron.
6. **Cada formulario con su guía.** Botón «i» con la guía de uso (quién, para qué, pasos, qué tener
   en cuenta, qué no hacer). Las guías forman «Mi manual», filtrado por los permisos del usuario.
7. **Seguridad de registros.** Cada escritura exige su permiso **en su área** y queda en la bitácora
   con el formato de Access. Si el proyecto tiene reglas de edición (días límite, solo registros
   propios, cierre de mes), van en una sola función que usan todas las acciones. Se conserva el
   primer autor.
8. **Datos reales solo en el servidor del cliente.** Para probar se usan datos de demostración
   (`db/semillas/demo.sql`) o una copia local. **Nunca** se suben datos reales a Vercel o Neon ni al
   repositorio. Cada módulo se prueba de punta a punta (navegador automatizado) antes de publicar.
9. **Español** en interfaz y código de dominio. El cliente es protagonista visual; GCH aparece solo
   como crédito discreto en el pie.

## Flujo de trabajo por formulario

1. Recibir capturas (vista diseño + vista hoja de datos) y el `.cls` del formulario de Access.
2. Leer el VBA: `Form_Load` (quién entra), `GenerarEstructura…` (filas automáticas), `ValidarCampos`,
   `Form_Current` (bloqueos), `*_AfterUpdate` (cálculos), `AuditoriaGlobal` (nombre del módulo en la
   bitácora), `Form_Delete` (permisos para borrar), combos (`RowSource`).
3. Revisar la tabla real: tipos, valores existentes (perfilar mín/mediana/máx de cada columna,
   valores distintos de las listas), datos raros, duplicados, referencias rotas.
4. Listar dudas y **preguntar**. Proponer correcciones de datos con evidencia; aplicarlas solo con
   autorización y siempre con bitácora.
5. Construir el módulo (ver `plantilla-modulo.md`) con su resultado debajo y su guía.
6. Migración de llaves/índices del módulo, verificada contra los datos.
7. Typecheck, lint, pruebas, build, prueba de punta a punta (claro, oscuro, teléfono).
8. Documentar en `docs/modulos/<modulo>.md`: reglas de Access, diferencias, pendientes.
9. Publicar (commit sin atribución → PR a `main` → merge) y avisar con un resumen corto: qué hay,
   cómo se probó, qué se decidió sin preguntar y qué falta configurar o confirmar.

## Stack de referencia

Next.js (App Router, Server Components, Server Actions), React, TypeScript estricto, Tailwind CSS v4
con tokens en `globals.css`, Prisma + PostgreSQL (consultas de vistas con `$queryRaw` + Zod),
Recharts, Zod para toda entrada, autenticación propia con sesión firmada, despliegue en Vercel + Neon
(rama de pruebas y de producción). Si el proyecto nuevo usa otra versión, leer su documentación
antes de escribir código.
