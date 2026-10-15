# Diseño de pantallas

- **El cliente es protagonista.** Logo oficial vectorizado (SVG) en el encabezado; el color de marca
  como acento (botón principal, enlaces, foco), nunca de fondo de pantallas completas. El
  desarrollador solo como crédito discreto en el pie.
- **Tokens** en `globals.css`: escala de marca 50–950 (texto/acción en el tono con contraste AA sobre
  blanco, ≥ 4,5:1), neutros cálidos (`fondo`, `superficie`, `superficie-2`, `borde`, `borde-fuerte`,
  `tinta`, `tinta-suave`, `tinta-tenue`) y `--viz-*` para gráficas. Modo **claro por defecto**;
  claro/oscuro/sistema por usuario (cookie → `data-tema` en `<html>`).
- **Tipografía y ritmo:** títulos `text-2xl/3xl font-semibold tracking-tight`, cifras con
  `tabular-nums`, tarjetas `rounded-xl border shadow-xs`, mucho aire, una jerarquía por pantalla.
- **Encabezado de módulo:** título + botón «i» (guía) + una línea que dice para qué sirve; a la
  derecha la acción principal («Nuevo …»).
- **Filtros** en una tarjeta arriba (en teléfono, plegados); «Aplicar», «Limpiar», «Excel» y una
  nota de cómo funcionan las fechas.
- **Formularios:** secciones con título y descripción («Lo completa el personal de Calidad»),
  controles de 44 px de alto, sufijo de unidad dentro del campo (`%`, `kg`, `kg/hl`), valores
  calculados en cajas punteadas de solo lectura, aviso de bloqueo con el motivo, mensajes en vivo
  (`aria-live`), barra de guardar fija abajo en planillas.
- **Planillas:** primera columna fija al desplazar, encabezado de columna con hora y turno/línea,
  candado en columnas de solo lectura, filas de sección en mayúsculas pequeñas.
- **Accesibilidad:** etiquetas reales en cada campo (`aria-label` «Campo · 08:00» en planillas),
  foco visible, contraste AA, nunca color como única señal, tablas con `caption`.
- **Móvil:** sin desplazamiento horizontal de la página (las tablas se desplazan dentro de su
  tarjeta), 16 px de margen, filtros plegables.
- **Navegación:** menú por áreas según permisos, «Inicio», «Mi manual», «Volver» (pantalla anterior
  con sus filtros; Inicio recuerda el desplazamiento).
