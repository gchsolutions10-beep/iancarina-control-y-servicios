# Personas y empresas (`/personas/fichas`)

Una ficha por persona natural o jurídica **dentro de cada empresa** (tabla `cys.partes`).

## Reglas
- Identificación única por empresa (normalizada: sin puntos, guiones ni espacios). La misma cédula
  puede existir en otra empresa del grupo: las empresas no comparten datos.
- Al crear, si hay fichas con nombre parecido (`pg_trgm`), el sistema las muestra y pide marcar
  «Es una persona distinta». La identificación exacta repetida siempre bloquea.
- Jurídicas: razón social y funciones (aseguradora, corredor, taller, transportista, proveedor), que
  después se usan en pólizas y siniestros.
- Datos personales (nacimiento, teléfono, correo, dirección): solo con `personas.datos_sensibles`;
  sin ese permiso se ven enmascarados y al modificar se conservan los que había.
- **No** se controlan socios ni acciones (el cliente lo confirmó el 2026-10-15): los socios solo
  interesan como asegurados, y eso se indica en cada póliza (Etapa 3).
- Todo cambio queda en la bitácora y se ve en el «Historial» de la ficha.

## Pendiente
- Consolidar duplicados (fusión) desde la web: el modelo ya lo admite (`estado = 'fusionada'`,
  `fusionada_en`); la pantalla se hará cuando haya pólizas que reapuntar.
