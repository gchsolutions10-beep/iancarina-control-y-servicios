# Base de datos (`/admin/base-datos`, solo administrador)

Misma idea que la consola de Planta Maíz, pero la usa el **administrador** (permiso `admin.sistema`),
no el rol técnico de desarrollador. Todo cambio queda en la bitácora, módulo «BASE DE DATOS».

| Sección | Uso |
|---|---|
| Datos de ejemplo y limpieza | Conteo por empresa; «Cargar datos de ejemplo»; «Limpiar datos» por grupos y empresa |
| Tablas y vistas | Todas las del esquema `cys`, con filtro, orden y paginado. Clic en una fila para editarla |
| Consola SQL | Una sentencia por vez; solo lectura salvo «Permitir cambios». Máximo 15 s y 1000 filas |

## Datos de ejemplo (`lib/demo/cargar.ts`)
- Solo en la demo (`PREPARAR_DEMO=true`) o en desarrollo; en la instalación del cliente no aparece.
- Carga en la empresa elegida: 30 personas, 7 organizaciones (3 aseguradoras, corredor, taller,
  transportista, tomador), 32 vehículos (con TM en camiones y chutos) y 6 propiedades con fotos
  ilustrativas, titulares, y 5 pólizas: flota liviana con período anterior y renovación vigente por
  vencer (un vehículo vendido antes de renovar queda excluido), endoso de alta y baja por venta; flota
  pesada pagada; accidentes personales con beneficiarios y pago parcial; incendio de propiedades con la
  prima vencida; y una póliza en preparación a la que le falta una tarifa (muestra el bloqueo). Además
  8 siniestros (cerrado y cobrado, en taller, robo sin movimiento, cerca del límite por vehículo,
  cerrado por cobrar, persona confidencial, propiedad y transporte con la cuenta vencida) y los límites
  de riesgos diversos de la flota.
- Todo marcado: organizaciones «(DEMO)», identificaciones de la serie 90.000.000, observaciones
  «Registro de ejemplo (DEMO)», fotos «FOTO DE EJEMPLO» y PDF «sin valor contractual». Las tasas son
  de demostración. Los ramos de personas y propiedades de ejemplo llevan «(DEMO)».
- Usa las mismas funciones que las pantallas (`lib/polizas/operaciones.ts`): mismo cálculo y bitácora.
- No se carga dos veces en la misma empresa (hay que limpiar antes).

## Limpiar (`lib/base-datos/grupos.ts`, `limpiar.ts`)
- Grupos: pagos y obligaciones · siniestros · pólizas · vehículos y propiedades · personas y
  organizaciones. Elegir uno arrastra lo que depende de él (personas → activos → pólizas → siniestros → pagos).
- Por empresa o todas. Exige motivo y escribir LIMPIAR. Una sola transacción: si algo falla no se
  borra nada. Los disparadores de protección se suspenden solo dentro de esa transacción.
- Borra también los archivos que quedan sin uso (registro y contenido en Blob o carpeta) y los ramos y
  coberturas «(DEMO)» que nadie usa.
- **No** borra empresas, usuarios, permisos, ajustes, catálogos, reglas generales ni la bitácora (es
  inmutable; la limpieza queda registrada). Para entregar en blanco al cliente: limpiar todo con
  «Todas las empresas» o, en producción, instalar sobre una base nueva.

## Consola
- `app_usuarios`, `app_bitacora`, `app_migraciones` y `archivos` son de solo lectura aquí; las claves
  nunca se muestran. Editar filas sigue respetando los disparadores (un período confirmado no se toca).
