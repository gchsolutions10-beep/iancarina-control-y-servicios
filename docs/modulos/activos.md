# Vehículos y propiedades (`/activos/vehiculos`, `/activos/propiedades`)

## Reglas
- Vehículos propios o de terceros. Placa única entre los vehículos **activos** de la empresa
  (normalizada). Marca y modelo, color, tipo y clasificación de chuto vienen de Configuración → Catálogos.
- **TM** se guarda como texto libre hasta que el cliente confirme su significado.
- Titulares con historial: propietario legal y responsable administrativo. Al registrar uno nuevo,
  el anterior termina el día previo; la base impide que se solapen.
- **Venta, transferencia o retiro**: el activo no se borra. Queda con estado, fecha y motivo, sus
  titularidades abiertas terminan ese día y la ficha pasa a solo lectura. Si la fecha es anterior a
  hoy queda en la bitácora como «BAJA RETROACTIVA». En la Etapa 3 la renovación excluye los
  vehículos con fecha de baja anterior al inicio de la nueva vigencia.
- Propiedades: valor declarado siempre con su moneda (sin conversión).

# Documentos y fotografías

- Se pueden adjuntar a personas, vehículos y propiedades (`cys.documentos`, una ficha por documento).
- El contenido **no** va a la base: Vercel Blob **privado** en la demo, carpeta del servidor en la
  intranet (`lib/archivos/almacen.ts`). La base guarda nombre, tipo, tamaño, SHA-256, quién y cuándo.
- El tipo se valida por el contenido (PDF, JPG, PNG, WEBP, Word .docx, Excel .xlsx). Tamaño máximo
  en Ajustes (4 MB en Vercel).
- Se abren solo por `/archivos/<id>`: sesión + acceso a la empresa; los confidenciales exigen
  `personas.datos_sensibles`. A otra empresa le responde «no encontrado». Cada apertura de un
  documento (no de fotos) queda en la bitácora.
- Retirar un documento lo oculta con motivo; el archivo y su registro se conservan.
