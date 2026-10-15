# Plantilla de un módulo nuevo

## Archivos (ejemplo: módulo `harina-molienda`, área Calidad)

| Archivo | Qué contiene |
|---|---|
| `lib/<modulo>/campos.ts` | Definición de campos/secciones (cliente y servidor), opciones de listas, cálculos puros e indicadores |
| `lib/<modulo>/datos.ts` | Consultas (`import "server-only"`): listar, obtener, catálogos |
| `lib/validations/<modulo>.ts` | Esquema Zod (si no se genera desde las secciones) |
| `actions/<modulo>.ts` | Server Action: permiso → regla de edición → Zod → transacción (guardar + bitácora) → `revalidatePath` |
| `components/<modulo>/*.tsx` | Formulario/planilla (cliente) y gráficas propias |
| `app/(sistema)/<area>/<modulo>/page.tsx` | Página: título + «i», filtros, registro, **resultado debajo** |
| `app/(sistema)/<area>/<modulo>/exportar/route.ts` | Excel con los mismos filtros |
| `lib/modulos.ts` | Entrada del menú: id, nombre, descripción, icono, permiso, tabla, ruta |
| `lib/ayuda/guias.ts` | Guía «i» con el mismo id |
| `db/migraciones/NNN_*.sql` (+ rollback) | Índices únicos y llaves `NOT VALID` + `VALIDATE`; correcciones autorizadas |
| `db/diagnosticos/<tabla>.sql` | Consultas para revisar los datos antes de la migración |
| `tests/<modulo>.test.ts` | Pruebas de cálculos y validaciones (con un registro real como caso) |
| `docs/modulos/<modulo>.md` | Reglas de Access, diferencias, resultado, pendientes por confirmar |

## Acción de guardar (patrón)

```ts
"use server";
export async function guardarX(_previo: Estado, formData: FormData): Promise<Estado> {
  const usuario = await requerirSesion();
  if (!tienePermiso(usuario, "area.registrar")) return { error: "Solo … puede registrar …" };
  const anterior = await obtener(id);                       // ¿existe?
  const regla = evaluarEdicion(actorEdicion(usuario, "area.registrar"), contexto, { fecha, idAutor: anterior?.id_gestion ?? null });
  if (!regla.permitido) return { error: regla.mensaje };
  const entrada = esquema.safeParse(leerFormulario(formData, CAMPOS));
  if (!entrada.success) return { error: "Revisa los campos marcados.", errores: erroresDeZod(entrada.error) };
  const valores = { ...entrada.data, ...calcular(entrada.data) }; // cálculos de Access, en el servidor
  await db.$transaction(async (tx) => {
    const guardado = await tx.tabla.update({ where: { id }, data: { ...valores, fecha_gestion: ahoraPlanta(), id_gestion: anterior.id_gestion ?? usuario.id } });
    const cambios = describirCambios(id, comparable(anterior), comparable(guardado));
    if (cambios) await registrarGestion(usuario.id, "MÓDULO COMO EN ACCESS", cambios, tx);
  });
  revalidatePath(RUTA);
  return { ok: true, mensaje: "Cambios guardados." };
}
```

## Planilla por hora (patrón genérico)

1. Secciones: `[{ titulo: "Granulometría", campos: [{ campo: "ret_mall_20", etiqueta: "Retención malla 20", tipo: "porcentaje", unidad: "%" }, …] }]`
   con tipos `porcentaje | numero | silos | lista | texto | id`. De ahí salen el esquema Zod, los
   nombres, los porcentajes y la exportación.
2. Página: `prepararHoja({ tabla, proceso, procesoLineas?, secciones, params })` → crea las horas que
   falten, columnas editables y filas con datos; `<PaginaHojaHoras … hoja={<Hoja …/>} resultado={…} />`.
3. Acción: `guardarHoras(cambios, { usuario, permiso, secciones, moduloLog, buscar, actualizar, calcular? })`.
4. Exportar: `exportarHoras(request, { tabla, proceso, secciones, archivo, extras? })`.
5. Filas calculadas en vivo: `{ etiqueta, despues: "campo", calcular: (valor) => texto }`.

## Lista de verificación antes de publicar

- [ ] Dudas de negocio preguntadas y respondidas (no suponer relaciones entre áreas).
- [ ] Datos reales perfilados; correcciones solo autorizadas, por valor y con bitácora.
- [ ] Permiso de página, menú y acción; regla de edición en cada escritura; bitácora con el nombre de Access.
- [ ] Resultado debajo con indicadores, gráfica validada, tabla y Excel.
- [ ] Guía «i» y documentación del módulo.
- [ ] Typecheck, lint, pruebas y build sin errores.
- [ ] Prueba de punta a punta con la copia real: cargar, guardar, recalcular, Excel, claro, oscuro y teléfono.
- [ ] Publicar y avisar: qué hay, qué se corrigió, qué falta confirmar (preguntas numeradas).
