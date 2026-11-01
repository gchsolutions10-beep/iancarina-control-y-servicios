# Instalar el sistema en el servidor de la empresa

Guía paso a paso para quien instala por primera vez. El mismo programa funciona en dos lugares:

| | Demo (nube) | Servidor de la empresa (interno) |
|---|---|---|
| Programa | Vercel | Un computador servidor de la empresa (Windows o Linux) |
| Base de datos | Neon (PostgreSQL en la nube) | PostgreSQL instalado en la empresa |
| Documentos y fotos | Vercel Blob | Una carpeta del servidor |
| Variables | Vercel → Settings → Environment Variables | Archivo `.env` en la carpeta del sistema |
| Datos | Ejemplos marcados «DEMO» | Datos reales; empieza en blanco |
| Entrada | `https://….vercel.app` | `http://NOMBRE-DEL-SERVIDOR:3000` desde la red interna |

Las **variables** son la configuración: dónde está la base, la clave de la sesión, dónde se guardan los
archivos. En Vercel se escriben en su pantalla; en el servidor van en un archivo de texto llamado `.env`
dentro de la carpeta del sistema (paso 6). Nunca se envían por correo ni se suben a GitHub.

La guía está pensada para **Windows Server** (o Windows 10/11 que quede siempre encendido). Al final hay
un apéndice para Linux.

---

> Requisitos del servidor para el área de TI (equipo, programas, red, respaldos y lista de chequeo):
> `docs/REQUISITOS-SERVIDOR.md`.

## Antes de empezar: qué necesita

- Un computador que quede encendido siempre, en la red de la empresa. Mínimo 4 GB de RAM y 20 GB libres.
- Usuario con permisos de **administrador** de Windows (para instalar programas).
- Conexión a internet durante la instalación (para descargar los programas).
- El enlace del repositorio que le entregue GCH Solutions (o el archivo ZIP del sistema).
- Unos 60 a 90 minutos.

Cuando la guía dice **«abra PowerShell»**: botón Inicio → escriba `PowerShell` → clic derecho →
**Ejecutar como administrador**. Los comandos se escriben (o pegan con clic derecho) y se ejecutan con Enter.

---

## Paso 1. Instalar los programas

Instale estos tres programas con las opciones por defecto (Siguiente, Siguiente…):

1. **Node.js 22 LTS** — https://nodejs.org → botón «LTS» → instalador `.msi`.
2. **Git** — https://git-scm.com/download/win.
3. **PostgreSQL 16** — https://www.postgresql.org/download/windows/ → «Download the installer».
   - Le pedirá una clave para el usuario `postgres`: **anótela en un lugar seguro**, es la llave maestra de la base.
   - Puerto: deje `5432`.
   - Incluye **pgAdmin 4**, el programa visual para ver la base.
   - Si la empresa ya tiene un servidor PostgreSQL, no lo instale de nuevo: use ese (pida a TI su dirección y un usuario).

Cierre y vuelva a abrir PowerShell, y compruebe:

```powershell
node -v      # debe mostrar v22.x.x
git --version
```

## Paso 2. Descargar el sistema

```powershell
cd C:\
git clone <ENLACE-DEL-REPOSITORIO> SistemaSeguros
cd C:\SistemaSeguros
```

(Si le entregaron un ZIP: descomprímalo en `C:\SistemaSeguros`.)

> Desde aquí, **todos los comandos se ejecutan dentro de `C:\SistemaSeguros`**. Si cierra PowerShell,
> vuelva a entrar con `cd C:\SistemaSeguros`.

## Paso 3. Crear la base de datos

1. Abra **pgAdmin 4** y entre con la clave de `postgres` del paso 1.
2. En el árbol de la izquierda: **Servers → PostgreSQL 16** → clic derecho en **Databases** →
   **Query Tool** (Herramienta de consultas) desde el menú *Tools*.
3. Pegue esto, **cambie la clave** por una suya (letras y números, sin `@ : / # ?` para no complicarse)
   y pulse ▶ (Ejecutar):

```sql
CREATE ROLE seguros_app LOGIN PASSWORD 'Cambie-Esta-Clave-2026';
CREATE DATABASE seguros OWNER seguros_app;
ALTER DATABASE seguros SET timezone TO 'America/Caracas';
```

Esto crea un usuario `seguros_app` solo para el sistema (no se usa `postgres`) y la base `seguros`.
Las tablas no se crean a mano: las crea el paso 7.

## Paso 4. Crear la carpeta de documentos y fotos

1. Cree la carpeta, por ejemplo `D:\SegurosArchivos` (o `C:\SegurosArchivos` si no hay disco D).
2. Esa carpeta debe incluirse en los **respaldos** de la empresa (paso 10): ahí quedan las pólizas,
   recibos y fotos que se suban.

**Cómo se guardan las fotos y documentos.** La base de datos **no** guarda los archivos: guarda solo
sus datos (nombre, tipo, tamaño, quién lo subió y una huella para comprobar que no cambió). El archivo
va a esta carpeta, ordenado por empresa y mes, con un nombre interno que nadie puede adivinar:

```
D:\SegurosArchivos\
   mary-iancarina\
      2026-11\
         3f2a9c1e-…-b7d4.jpg      ← foto de un vehículo
         9b10e4aa-…-0c21.pdf      ← cuadro de póliza
```

- Los usuarios nunca abren la carpeta: ven y descargan los archivos desde el sistema, que antes revisa
  si tienen permiso en esa empresa (los documentos confidenciales solo los ve quien tiene el permiso).
- No mueva ni renombre archivos a mano: el sistema los busca por su nombre interno.
- El tamaño máximo por archivo se cambia en **Configuración → Ajustes** (en el servidor puede pasar de 4 MB).
- Si TI prefiere una carpeta compartida de otro servidor, puede usarse siempre que el usuario de
  Windows que ejecuta el sistema tenga permiso de lectura y escritura; lo más sencillo es un disco del
  mismo servidor con copia diaria a otro lado.

## Paso 5. Instalar las piezas del sistema

```powershell
npm ci
```

Tarda unos minutos y descarga lo que el sistema necesita. Al final no debe decir `ERR!`.

## Paso 6. Escribir la configuración (archivo `.env`)

1. Copie la plantilla:

   ```powershell
   copy .env.servidor.example .env
   notepad .env
   ```

2. Genere la clave de sesión (en **otra** ventana de PowerShell, dentro de `C:\SistemaSeguros`):

   ```powershell
   npm run secreto
   ```

   Copie el texto largo que aparece.

3. En el Bloc de notas complete:

| Variable | Qué poner | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Usuario, clave, servidor y base del paso 3 | `postgresql://seguros_app:Cambie-Esta-Clave-2026@localhost:5432/seguros` |
| `SESSION_SECRET` | El texto de `npm run secreto` | `198no0yGiSlzp23e…` |
| `SESSION_COOKIE_SECURE` | `false` si se entra con `http://` (lo normal en la red interna) | `false` |
| `ADMIN_INICIAL_USUARIO` | Usuario del primer administrador | `admin` |
| `ADMIN_INICIAL_CLAVE` | Su clave (10 o más caracteres, letras y números) | `Una-Clave-Larga-2026` |
| `ARCHIVOS_RUTA_BASE` | La carpeta del paso 4, con barras `/` | `D:/SegurosArchivos` |

   Deje `ALMACEN=carpeta`, `PREPARAR_DEMO=false` y `ZONA_HORARIA="America/Caracas"`.
   Si PostgreSQL está en **otro** servidor, cambie `localhost` por el nombre o IP de ese servidor.

4. Guarde (Ctrl+G) y cierre el Bloc de notas.

## Paso 7. Instalar las tablas y el administrador

```powershell
npm run instalar
```

El comando revisa todo y explica cada problema en palabras simples. Si todo está bien termina con:

```
✓ Administrador inicial «admin» creado
✓ Listo. Siguiente paso: npm run build y luego npm start (o pm2, ver la guía).
```

Si aparece una ✗, corrija lo que dice en el `.env` (con `notepad .env`) y repita `npm run instalar`.
Puede ejecutarlo las veces que quiera: no duplica nada.

## Paso 8. Compilar y probar

```powershell
npm run build
npm start
```

Abra el navegador **en el mismo servidor** en http://localhost:3000 y entre con el administrador del
paso 6. Si funciona, vuelva a PowerShell y pulse **Ctrl+C** para detenerlo (el paso 9 lo deja fijo).

## Paso 9. Dejarlo encendido siempre (PM2)

PM2 mantiene el sistema funcionando y lo vuelve a encender si el servidor se reinicia.

```powershell
npm install -g pm2 pm2-windows-startup
pm2-startup install
pm2 start ecosystem.config.cjs
pm2 save
```

Comandos útiles: `pm2 status` (¿está encendido?), `pm2 logs seguros` (ver errores), `pm2 restart seguros`.

**Permitir la entrada desde otros computadores** (firewall de Windows), una sola vez:

```powershell
New-NetFirewallRule -DisplayName "Sistema de Seguros" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

Desde cualquier computador de la red: `http://NOMBRE-DEL-SERVIDOR:3000` (o con su IP, por ejemplo
`http://192.168.1.20:3000`). El nombre se ve con el comando `hostname`.

## Paso 10. Respaldos (muy importante)

```powershell
.\scripts\windows\respaldar.ps1
```

Crea un archivo en `C:\Respaldos\Seguros` (conserva los últimos 30). Para hacerlo **todos los días**:
Programador de tareas de Windows → **Crear tarea básica** → Diariamente, 11:00 p. m. → Iniciar un programa:

- Programa: `powershell.exe`
- Argumentos: `-ExecutionPolicy Bypass -File C:\SistemaSeguros\scripts\windows\respaldar.ps1`
- Iniciar en: `C:\SistemaSeguros`

Copie también `C:\Respaldos\Seguros` y la carpeta de archivos del paso 4 a otro disco o a la nube de la empresa.

> Si PowerShell dice que «la ejecución de scripts está deshabilitada», ejecute una vez:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` y responda `S`.

## Paso 11. Primeros pasos dentro del sistema

1. Entre como administrador → **Configuración → Empresas** → cree las empresas del grupo.
2. **Configuración → Usuarios** → cree a cada analista con su rol por empresa (Analista o Consulta).
3. **Configuración → Catálogos** → revise ramos, coberturas y listas.
4. **Configuración → Reglas** → apruebe las reglas «Propuesta» que coincidan con los contratos.
5. Lea el **Manual** (menú superior): reúne la guía de cada pantalla.
6. Después del primer ingreso puede borrar `ADMIN_INICIAL_CLAVE` del `.env` (el usuario ya existe).

---

## Actualizar a una versión nueva

Cuando GCH Solutions publique cambios:

```powershell
cd C:\SistemaSeguros
.\scripts\windows\actualizar.ps1
```

Hace solo: respaldo → descarga → `npm ci` → `npm run instalar` (cambios en la base) → `npm run build` →
`pm2 restart seguros`. Si algo falla, se detiene y dice en qué paso; el respaldo ya quedó hecho.

## Si algo no funciona

| Síntoma | Qué hacer |
|---|---|
| No sé qué está mal | `npm run verificar` revisa todo sin cambiar nada y dice qué corregir |
| «La clave o el usuario de la base no son correctos» | Revise usuario y clave en `DATABASE_URL` (paso 3 y 6) |
| «No se llega al servidor PostgreSQL» | ¿Está encendido el servicio `postgresql-x64-16`? (Servicios de Windows) ¿Host y puerto correctos? |
| Entra en el servidor pero no desde otro PC | Falta la regla del firewall (paso 9) |
| Entra pero al iniciar sesión vuelve a la portada | `SESSION_COOKIE_SECURE` debe ser `false` si la dirección empieza con `http://` |
| No deja subir documentos | `npm run verificar`: revise `ARCHIVOS_RUTA_BASE` y los permisos de la carpeta |
| La página no abre | `pm2 status` y `pm2 logs seguros` |

## Opcional: entrar con https://

Dentro de la red interna `http://` es suficiente. Si TI quiere `https://` (certificado propio de la
empresa), se pone delante un servidor web (IIS con *URL Rewrite* + *ARR*, o Caddy) que reenvíe a
`http://localhost:3000`, y se cambia `SESSION_COOKIE_SECURE=true`.

---

## Apéndice: servidor Linux (Ubuntu 22.04/24.04)

```bash
# Programas
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git postgresql-16   # o el PostgreSQL de la empresa

# Base (paso 3)
sudo -u postgres psql -c "CREATE ROLE seguros_app LOGIN PASSWORD 'Cambie-Esta-Clave-2026'"
sudo -u postgres psql -c "CREATE DATABASE seguros OWNER seguros_app"
sudo -u postgres psql -c "ALTER DATABASE seguros SET timezone TO 'America/Caracas'"

# Sistema (pasos 2, 4 a 9)
sudo git clone <ENLACE-DEL-REPOSITORIO> /opt/seguros && sudo chown -R $USER /opt/seguros && cd /opt/seguros
sudo mkdir -p /srv/seguros-archivos && sudo chown $USER /srv/seguros-archivos
npm ci
cp .env.servidor.example .env && nano .env      # ARCHIVOS_RUTA_BASE="/srv/seguros-archivos"
npm run instalar && npm run build
sudo npm install -g pm2 && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup   # copie y ejecute la línea que muestra

# Respaldo diario (crontab -e)
# 0 23 * * * cd /opt/seguros && pg_dump --format=custom --dbname="$(grep ^DATABASE_URL= .env | cut -d= -f2- | tr -d '"')" -f /var/backups/seguros-$(date +\%F).backup
```

Actualizar: `git pull && npm ci && npm run instalar && npm run build && pm2 restart seguros` (después de un respaldo).
