# Personas y empresas (`/personas/fichas`, `/personas/socios`)

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
- Relaciones con la empresa (socio, accionista, propietario, director): con fecha de inicio y fin; la
  base impide que la misma relación se solape en el tiempo. No se borran: se terminan.
- Ser socio no implica estar asegurado (eso se indicará en cada póliza, Etapa 3).
- Todo cambio queda en la bitácora y se ve en el «Historial» de la ficha.

## Pendiente
- Consolidar duplicados (fusión) desde la web: el modelo ya lo admite (`estado = 'fusionada'`,
  `fusionada_en`); la pantalla se hará cuando haya pólizas que reapuntar.
