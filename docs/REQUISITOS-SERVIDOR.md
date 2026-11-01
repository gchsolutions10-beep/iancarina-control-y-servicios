# Requisitos del servidor — Control de Seguros

Para el área de TI de Mary Iancarina, C.A. Resume qué debe tener el servidor donde se instala el
sistema y qué preparar antes del día de la instalación. El paso a paso está en
`docs/INSTALACION-SERVIDOR.md`.

## En pocas palabras

- Es una aplicación web: se instala **una sola vez en un servidor** y los usuarios entran desde el
  navegador de su computador (Chrome, Edge o Firefox actualizados). No se instala nada en los PC.
- Funciona **dentro de la red de la empresa**. Internet solo hace falta durante la instalación y las
  actualizaciones. Ningún dato sale de la empresa.
- Usa **PostgreSQL** como base de datos (puede ser uno que la empresa ya tenga) y una **carpeta** del
  servidor para los documentos y fotos.

## 1. Equipo

| | Mínimo | Recomendado |
|---|---|---|
| Procesador | 2 núcleos | 4 núcleos |
| Memoria RAM | 4 GB | 8 GB |
| Disco para el sistema y la base | 20 GB libres | 50 GB libres (SSD) |
| Disco para documentos y fotos | 20 GB | 100 GB (crece unos 2–5 GB por año con fotos de vehículos y pólizas escaneadas) |
| Disponibilidad | Encendido en horario laboral | Encendido 24/7, con UPS |

Hasta unos 30 usuarios a la vez no hace falta más. Puede ser una máquina virtual.

## 2. Sistema operativo (uno de estos)

- **Windows Server 2019 o 2022** (recomendado si TI ya administra Windows).
- Windows 10/11 Pro de 64 bits, siempre encendido (aceptable para pocos usuarios).
- Linux Ubuntu Server 22.04 o 24.04 LTS.

## 3. Programas

| Programa | Versión | Para qué | Notas |
|---|---|---|---|
| **Node.js** | 22 LTS (20.9 o superior) | Ejecuta el sistema | Instalador oficial de nodejs.org |
| **PostgreSQL** | 16 (14 o superior) | Base de datos | Puede ser el de la empresa. Debe incluir las extensiones estándar `btree_gist` y `pg_trgm` (vienen con el instalador de Windows y con el paquete de Ubuntu) |
| **Git** | Reciente | Descargar y actualizar el sistema | Opcional si se entrega en ZIP |
| **PM2** | Reciente | Mantener el sistema encendido y arrancarlo con el servidor | Se instala con `npm install -g pm2` |
| pgAdmin 4 | Reciente | Ver la base y hacer tareas puntuales | Viene con PostgreSQL en Windows |

## 4. Base de datos

- Una base nueva, por ejemplo `seguros`, con zona horaria `America/Caracas`.
- Un usuario **propio del sistema** (por ejemplo `seguros_app`) dueño de esa base. No hace falta el
  usuario `postgres` ni permisos de superusuario.
- Si PostgreSQL está en **otro** servidor: acceso desde el servidor del sistema al puerto **5432**.
- Las tablas las crea el instalador (`npm run instalar`); no se cargan a mano.

## 5. Red y seguridad

| Qué | Detalle |
|---|---|
| Nombre o IP fija del servidor | Para que los usuarios entren con `http://NOMBRE-DEL-SERVIDOR:3000` |
| Puerto | **3000/TCP** abierto en el firewall para la red interna (o 80/443 si TI pone delante IIS o Caddy) |
| HTTPS | Opcional dentro de la red. Si TI tiene un certificado interno, se usa con un proxy delante |
| Internet | Solo para instalar y actualizar (descargas de nodejs.org, npmjs.com y GitHub) |
| Archivo de configuración `.env` | Contiene la clave de la base: solo lo leen los administradores del servidor |
| Antivirus | Puede ser necesario excluir la carpeta del sistema si ralentiza la instalación |

## 6. Carpeta de documentos y fotos

- Una carpeta en un disco del servidor, por ejemplo `D:\SegurosArchivos`.
- El usuario de Windows que ejecuta el sistema necesita **lectura y escritura**.
- La base no guarda los archivos: guarda su nombre y su huella; el archivo queda en esta carpeta,
  ordenado por empresa y mes. Los usuarios los ven y descargan desde el sistema, con sus permisos.

## 7. Respaldos

| Qué | Cómo | Frecuencia |
|---|---|---|
| Base de datos | `scripts/windows/respaldar.ps1` (usa `pg_dump`), programado en el Programador de tareas | Diario |
| Documentos y fotos | Copia de la carpeta del punto 6 | Diario |
| Copia fuera del servidor | Otro disco, NAS o la nube de la empresa | Diario o semanal |

Se conservan 30 respaldos. Conviene probar una restauración al menos una vez.

## 8. Qué tener listo el día de la instalación

- [ ] Servidor encendido, con usuario administrador de Windows (o `sudo` en Linux).
- [ ] Internet en el servidor durante la instalación.
- [ ] Clave del usuario `postgres` (o un usuario de PostgreSQL que pueda crear la base).
- [ ] Nombre o IP del servidor y regla de firewall aprobada para el puerto 3000.
- [ ] Ruta de la carpeta de documentos y dónde se copiarán los respaldos.
- [ ] Usuario y clave del primer administrador del sistema.
- [ ] Lista de empresas del grupo (nombre y RIF) y de usuarios con su rol en cada una.
- [ ] Una persona de TI disponible unas **2 horas**.

## 9. Cómo se comprueba que quedó bien

- `npm run verificar` revisa la configuración, la base, la carpeta y el administrador, y dice en
  palabras simples qué corregir.
- Desde otro computador de la red se abre `http://NOMBRE-DEL-SERVIDOR:3000` y se entra con el
  administrador.

## 10. Después

- **Actualizaciones:** `scripts/windows/actualizar.ps1` hace respaldo, descarga, actualiza la base,
  compila y reinicia.
- **Datos reales solo en este servidor.** La demo en la nube usa datos de ejemplo y no se mezcla con
  esta instalación.
