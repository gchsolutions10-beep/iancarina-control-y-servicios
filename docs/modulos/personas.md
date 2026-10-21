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

## Personas duplicadas (`/personas/duplicados`, Etapa 2b)

Permiso «Anular y ajustar» en la empresa (el administrador lo tiene siempre).

- **Candidatos**: pares de la misma empresa y tipo con el mismo número de identificación (aunque
  cambie la letra: V-123 / E-123) o nombre muy parecido (`pg_trgm`, similitud ≥ 0,5). «No son la
  misma» guarda el par en `cys.personas_distintas` y deja de proponerse.
- **Comparar** (`/personas/fusionar?origen=&destino=`): datos lado a lado, registros que se mueven,
  datos que el destino toma del origen (teléfono, correo, dirección, fecha de nacimiento, foto y
  funciones) y bloqueos. Desde una ficha: «Fusionar con otra ficha» busca la otra.
- **Fusionar**: `cys.fusionar_partes()` reapunta en una transacción las 11 tablas que referencian a la
  parte (`cys.columnas_parte()`): titularidades, documentos, pólizas (aseguradora), tomador/pagador,
  asegurados, beneficiarios, reglas de la aseguradora, obligaciones, pagos, afectados y transportistas;
  también en pólizas confirmadas y pagos, cuyos disparadores aceptan **solo** ese cambio de llave y solo
  dentro de la función (variable local `cys.fusion`). El origen queda `fusionada` con `fusionada_en`;
  su identificación queda libre (índice único parcial). Se bloquea si ambas fichas están en la misma
  póliza (o como beneficiarias del mismo asegurado) con fechas que se cruzan.
- **Registro** `cys.fusiones_personas` (inmutable salvo la marca de reversión): motivo, filas movidas y
  datos completados. Bitácora en ambas fichas (operación `FUSION`).
- **Revertir** (`cys.revertir_fusion()`): las filas movidas vuelven al origen, lo completado se quita
  si nadie lo cambió y el origen recupera su estado. Lo registrado después en el destino se queda ahí.
  No se revierte si el destino se fusionó después en otra ficha (primero esa).
- Una ficha fusionada se consulta (aviso con enlace a la que quedó) pero no se modifica ni aparece en
  listas ni selectores.
