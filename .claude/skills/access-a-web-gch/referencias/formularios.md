# Cómo se replica cada tipo de formulario de Access

## Lectura del VBA (qué buscar en el .cls)

| En Access | En la web |
|---|---|
| `Form_Load` + `ValidarIngresosEnFormularios Me, (perfil)` | Permiso de la página (`requerirPermiso`) y del menú |
| `ObtenerFechaProduccion()` en el filtro | Fecha por defecto = fecha de producción |
| Filtros Desde/Hasta/Turno (solo Desde = ese día; solo Hasta = desde el 1.º del mes) | Mismos filtros por URL (`?desde=&hasta=&turno=`), compartibles |
| `GenerarEstructura…` (INSERT desde `list_horarios_aut`) | Crear las filas que falten al abrir la fecha, con candado e índice único |
| `ValidarCampos` | Esquema Zod en el servidor (y ayudas en la pantalla) |
| `Form_Current` + `PuedeGestionarRegistro…` | `evaluarEdicion()`: días límite, autor, cierre de mes, excepciones |
| `*_AfterUpdate` (cálculos) | Función pura en `lib/<modulo>/calculos.ts` con prueba; cálculo en vivo en pantalla y otra vez en el servidor al guardar |
| `ValidarTextoSilosSeparadorPorGuiones` | Normalizar y validar listas «101-102-P» (espacio/coma → guion) |
| `AuditoriaGlobal(Me, tabla, id, "MÓDULO")` | Bitácora con el **mismo** nombre de módulo |
| `AuditoriaEliminacion` | Borrar con confirmación y copia en la bitácora (`DELETE_MÓDULO`) |
| Combos (`RowSource`) | Catálogos `list_*`/`set`; mostrar también valores históricos que ya no están en la lista |
| Botón «Ver reporte» | Resultado debajo + exportar a Excel con los mismos filtros |

Cuidado: el VBA suele tener copias de otros formularios (ej. un formulario de empaque que crea sus
horas con el proceso «CONTROL HARINA MOLIENDA»). Se respeta lo que hace Access y se documenta.

## Tipos de pantalla

1. **Lista + detalle** (registros sueltos: ingresos, despachos, paradas, bonos):
   lista con filtros, totales y «Nuevo»; detalle con secciones; eliminar con confirmación.
   Al crear, redirigir al detalle con aviso de éxito.
2. **Planilla por hora** (controles de proceso de Calidad, control de silos, inventario por turno):
   las filas de la tabla se crean solas desde los horarios automáticos; en pantalla las **horas son
   columnas** y los **campos filas** (como la planilla en papel), agrupados por etapa, con pestañas
   por turno y «Todos». Un horario nuevo en `list_horarios_aut` aparece como columna sin tocar código.
   Si hay otra dimensión (línea, máquina), una columna por hora × línea/máquina, con pestañas para
   filtrar por turno y por máquina.
   Guardar una sola vez todas las horas cambiadas; cada hora se valida y audita aparte; si una
   falla, las demás se guardan y la columna queda marcada con el motivo. Columnas con candado si no
   se pueden editar (pasar el cursor muestra por qué). Filas calculadas en vivo para revisar
   (ej. «la granulometría debe sumar 100 %», «la mezcla de silos debe sumar 100»).
   Una hora creada vacía **no tiene dueño** (Access anota a quien abrió el día): la llena cualquiera
   y su autor es quien la llenó primero.
3. **Hoja por día** (supervisores por turno, producción por línea/turno): una fila por combinación
   del día, con reconfiguración de jornada que nunca borra filas con datos.
4. **Registro de otra área sobre el mismo dato** (Calidad sobre el ingreso de Suministro): arriba,
   en solo lectura, lo que cargó la otra área; debajo, el formulario propio, con el valor de la otra
   área bajo cada campo para comparar.

## Reglas comunes

- Porcentajes: se escriben 0–100 con coma decimal, se guardan como fracción. Números con coma.
- Fechas y horas: zona de la planta; horas `HH:MM`; fecha de producción con corte.
- Turnos: los del proceso y la jornada (hábil/festiva) salvo que el área trabaje siempre los mismos.
- Formularios con `<select>` controlados: enviar sin reiniciar el formulario (React 19 lo reinicia).
- Mensajes claros en español, en el lugar del error; nada de alertas modales para validar.
- «Volver» en la barra: vuelve a la pantalla anterior con sus filtros; Inicio recuerda el desplazamiento.

## Guía «i» y «Mi manual»

Cada módulo tiene su guía (mismo id que en el menú): `quien`, `para`, `pasos` (en orden, cómo
llenarlo), `tener` (reglas, cálculos automáticos), `evitar` (errores típicos). Una prueba falla si
un módulo publicado no tiene guía. «Mi manual» junta las guías de lo que cada usuario puede ver.
