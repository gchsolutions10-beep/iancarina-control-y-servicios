# Reglas de negocio y preguntas pendientes (Etapa 1)

## 1. Reglas identificadas en el requerimiento

| # | Regla | Dónde se aplica |
|---|---|---|
| R1 | Tomador, asegurado, propietario, beneficiario, contratante, pagador y corredor son roles distintos; una parte puede tener varios, siempre explícitos. | `periodo_partes`, `inclusiones`, `beneficiarios`, `titularidades` |
| R2 | Ser socio o propietario de una empresa no hace a la persona asegurada. | Sin regla automática entre `persona_empresa_relaciones` e `inclusiones` |
| R3 | Una persona = una ficha. Los duplicados se consolidan sin borrar. | Único por identificación + fusión (§5.1 del modelo) |
| R4 | Cambios de tomador, asegurado o beneficiario: con fecha efectiva y sin alterar lo anterior. | Endosos |
| R5 | Un período confirmado no se edita; la renovación crea uno nuevo. | `poliza_periodos` + disparador |
| R6 | Un vehículo vendido no se borra; se excluye de renovaciones según la regla de elegibilidad. | `vehiculos.fecha_baja`, asistente de renovación |
| R7 | Ninguna fórmula, tasa, límite o prorrateo se asume: todo se configura con ámbito y vigencia. | `reglas_calculo`, `parametros_regla`, `limites` |
| R8 | Sin parámetros obligatorios: simulación sí, confirmación financiera no. | Motor de cálculo |
| R9 | Modificar un resultado calculado guarda original, final, motivo y responsable. | `calculo_ajustes` |
| R10 | Simulación ≠ importe confirmado por la aseguradora ≠ obligación financiera. | `endosos.estado`, `obligaciones` |
| R11 | Los importes de coberturas se guardan por concepto; el total no cuenta dos veces lo incluido en otro. | `coberturas.incluida_en_padre`, `suma_en_total` |
| R12 | Autorizado ≠ pagado; reconocido ≠ cobrado. Cerrar la reparación no cierra la cuenta por cobrar. | Finanzas por movimientos |
| R13 | Pagos y reembolsos parciales; saldos desde movimientos imputados. | `pagos`, `imputaciones` |
| R14 | Varias monedas sin conversión automática. | Moneda en cada importe; totales por moneda |
| R15 | Los transportistas externos no quedan cubiertos por las pólizas de vehículos propios salvo vínculo explícito. | `siniestro_transporte` sin inclusión automática |
| R16 | Los límites de riesgos diversos se configuran por contrato; se avisa si una operación los supera, mostrando el cálculo del disponible. | `limites` + vista de disponible |
| R17 | Flujo de siniestros configurable por tipo; el inicial de vehículos propios: notificación → orden de reparación → entrada a taller → entrega → reembolso. | `flujos`, `flujo_etapas` |
| R18 | Datos personales con acceso mínimo; operaciones sensibles auditadas. | Permisos por empresa, `personas.datos_sensibles`, `app_bitacora` |
| R19 | Archivos: tipo validado por contenido, acceso solo por la aplicación, nunca en tablas de PostgreSQL. | `archivos`, adaptadores de almacenamiento |
| R20 | Datos sintéticos claramente marcados en la demo; nunca cifras ficticias como resultados reales. | Semilla de demo con prefijo «DEMO» |

## 2. Preguntas para el cliente

Las 1–17 vienen del requerimiento; las 18–30 salieron de la auditoría. Mientras no haya respuesta,
el sistema deja la regla configurable y bloquea la confirmación que dependa de ella.

**Vehículos y cálculos**
1. ¿Qué significa **TM** en la ficha del vehículo? ¿Es texto, número o una lista?
2. ¿Qué significa **APOV**? ¿Es una cobertura con prima propia o parte de otra?
3. ¿Cómo se calcula la **suma asegurada** de un vehículo (valor + aditamentos/blindaje, otro criterio)?
4. ¿En qué **base y unidad** están las tasas (% anual, por mil, por monto fijo)?
5. ¿Cuál es la **fórmula de prima** de cada cobertura (casco, RCV, exceso de límite, defensa penal, APOV, asistencia vial)? Ideal: una hoja de cálculo real con un caso resuelto por la aseguradora.
6. ¿Cómo se tratan los **componentes de RCV**? ¿Exceso de límite y defensa penal van dentro de RCV o aparte?
7. ¿Qué **regla de prorrateo** usa cada aseguradora (días exactos con qué base, meses, tabla de corto plazo)?
8. **Riesgos diversos**: ¿los USD 60.000 anuales y USD 20.000 por vehículo son de una póliza concreta? ¿Qué importe consume el límite: autorizado, reconocido o pagado? ¿Hay excepciones?
9. **Elegibilidad**: ¿un vehículo vendido se excluye si la venta es anterior al inicio de la nueva vigencia, o también si es anterior a la fecha de emisión de la renovación? ¿Qué pasa con personas que dejan de ser socias?

**Personas**
10. ¿Qué **ramos personales** usa la empresa hoy (vida, salud, accidentes personales, funerario…)?
11. ¿Qué **datos personales son obligatorios** en cada póliza (¿fecha de nacimiento siempre?)?
12. Reglas de **tomadores, asegurados y beneficiarios**: ¿dependientes (cónyuge, hijos)?, ¿los beneficiarios suman 100 %?, ¿puede haber varios tomadores?

**Administración**
13. Definición de los **promedios e indicadores financieros** (¿tasa promedio ponderada o simple?).
14. Formato de **CECO y organización** (código, quién los asigna, ¿cambian en el año?). ¿El CECO va por vehículo/persona o por póliza?
15. ¿Qué **archivos Excel y documentos históricos** existen? ¿Se cargan al arrancar? ¿Desde qué año?
16. **Infraestructura de la intranet**: versión de PostgreSQL, sistema operativo del servidor, carpeta compartida, ¿extensiones `btree_gist` y `pg_trgm` disponibles?
17. **Monedas** en uso (USD, Bs., EUR) y si alguna vez se necesita mostrar equivalencias (con qué tasa y fuente).

**Surgidas en la auditoría**
18. ¿Existe hoy un sistema (Access, Excel u otro) del que haya que **migrar datos**? Si es Access, aplica el método completo de GCH; si es Excel, se hace un cargador con validación.
19. **Cliente y marca**: ¿el sistema es de Mary Iancarina, C.A. (mismo logo y rojo `#e72a18`) o de otra empresa del grupo? ¿Nombre del sistema y del departamento que lo usa?
20. **Empresas y filiales** iniciales. ¿Hay pólizas corporativas que cubren bienes o personas de **varias filiales** (una póliza, cargo por empresa/CECO)?
21. **Visibilidad de personas entre empresas**: un usuario de la filial A, ¿puede saber que una persona ya está registrada por la filial B? ¿Qué parte de su ficha puede ver?
22. **Identificación de vehículos**: ¿la placa es única y estable, o hace falta serial de carrocería/motor? (no se agrega ningún campo sin confirmar)
23. ¿El **número de póliza** es único por aseguradora? ¿Cómo se numeran los **expedientes** de siniestro (formato, por empresa, por año)?
24. **Usuario estándar**: ¿qué puede ver y hacer (registrar pólizas, pagos, siniestros)? ¿Quién ve datos personales y siniestros de personas?
25. ¿Quién **autoriza** anulaciones, ajustes de cálculo y ventas retroactivas? ¿Hace falta doble aprobación?
26. ¿Hay **corredor** en todas las pólizas? ¿Se registran comisiones? (no incluido hasta confirmar)
27. **Demo**: ¿qué almacenamiento en la nube se usa para documentos (Vercel Blob, Cloudflare R2, Amazon S3)? ¿Tamaño máximo por archivo?
28. ¿Hace falta **aviso** de vencimientos (pólizas por vencer, expedientes sin movimiento, cuentas por cobrar vencidas)? ¿Con cuántos días?
29. ¿Algún requisito legal de **protección de datos** o de conservación de documentos que debamos cumplir?
30. Las etapas de siniestros de **personas y propiedades**: ¿usan el mismo flujo de vehículos o uno propio?
