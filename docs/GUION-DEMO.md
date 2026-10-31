# Guion para presentar el sistema al cliente (20–30 minutos)

La demo de Vercel usa **datos de ejemplo marcados (DEMO)**: nada es real. Se cargan y se borran desde
el sistema, sin tocar la base a mano.

## Antes de la reunión (5 minutos)

1. Entre a la demo como administrador.
2. **Programador → Datos de ejemplo**: elija «Mary Iancarina, C.A. (DEMO)» y pulse **Cargar datos de
   ejemplo**. Tarda unos segundos y deja: 31 personas (una duplicada a propósito), 7 organizaciones
   (aseguradoras, corredor, taller, transportista), 32 vehículos y 6 propiedades con fotos, 5 pólizas con
   vigencias, renovación, endosos de alta y baja, pagos parciales y documentos, y 8 siniestros con límites
   y cuentas por cobrar.
   - Si dice que ya tiene los datos, están cargados. Para empezar de cero: **Limpiar datos** (grupo
     «Personas y organizaciones», empresa DEMO, escribir LIMPIAR) y cargar de nuevo.
3. Cree un usuario de **Consulta** para mostrar que solo ve (Configuración → Usuarios).
4. Si quiere que el cliente vea los recorridos guiados, en **Manual → Recorridos guiados** pulse
   «Volver a mostrar todos los recorridos».

## Durante la reunión

| # | Pantalla | Qué mostrar | Mensaje para el cliente |
|---|---|---|---|
| 1 | Inicio | El recorrido de bienvenida y el menú corto | «Cada persona ve solo lo suyo y el sistema le enseña a usarlo.» |
| 2 | Gestión de Pólizas → Tablero | Primas, sumas aseguradas y saldos por moneda; gráficas; lo que vence | «La gerencia ve todo en una pantalla, sin Excel.» |
| 3 | Campana de avisos | Primas vencidas, pólizas por vencer, expedientes detenidos | «Nada se pasa por alto: el sistema avisa.» |
| 4 | Vehículos → una placa | Fotos, propietario, pólizas y siniestros del vehículo; toneladas | «La ficha completa de cada camión en un clic.» |
| 5 | Pólizas → AUT-DEMO-0001 → vigencia 2 | Asegurados, tarifas, primas calculadas con reglas, CECO | «La prima se calcula sola y se puede auditar.» |
| 6 | Mismo período → Endosos | Un alta y una baja con prorrata por días | «Altas y bajas a mitad de año, con su ajuste exacto.» |
| 7 | AUT-DEMO-0001 vigencia 2 → comparación con la vigencia 1 | Qué cambió de un año a otro | «Renovar es revisar, no volver a cargar todo.» |
| 8 | Finanzas → Primas por pagar | Pagos parciales, saldo, antigüedad | «Siempre sabemos cuánto se debe a cada aseguradora.» |
| 9 | Siniestros → un expediente | Etapas, documentos requeridos, importes, límite (aviso 80 %), cuenta por cobrar | «Cada siniestro con su historia y su dinero.» |
| 10 | Reportes → Detalle por CECO → Excel | Reparto de primas por centro de costo | «Contabilidad recibe el reparto listo.» |
| 11 | Personas duplicadas | DANIELA MARTÍNEZ (V) y MARTÍNES (E): comparar y fusionar, luego revertir | «Los errores de carga se corrigen sin perder nada.» |
| 12 | Usuario de Consulta | Entrar con él: ve todo pero no puede modificar | «Permisos por empresa y por persona.» |
| 13 | Ficha → Historial | Quién cambió qué y cuándo | «Todo queda registrado; nada se borra.» |

## Cierre

- Instalación: en la demo (nube) o en el servidor de la empresa con sus propios datos
  (`docs/INSTALACION-SERVIDOR.md`).
- Lo que falta confirmar del contrato: tasas y reglas marcadas «Propuesta» (`docs/REGLAS-Y-PENDIENTES.md`).
- Siguiente módulo: Presupuestos.

## Después

Antes de cargar datos reales en la demo (no recomendado: los datos reales van al servidor del cliente),
use **Limpiar datos** para dejarla en blanco.
