# Respaldo de la base del sistema de seguros (servidor Windows).
# Uso (PowerShell, en la carpeta del sistema):   .\scripts\windows\respaldar.ps1
# Deja un archivo .backup en la carpeta Respaldos (o la que indique -Destino).
# Restaurar (con pgAdmin o):  pg_restore --clean --if-exists --dbname="<DATABASE_URL>" archivo.backup
param(
  [string]$Destino = "C:\Respaldos\Seguros",
  [string]$PgBin = "C:\Program Files\PostgreSQL\16\bin"
)
$ErrorActionPreference = "Stop"

# La dirección de la base se lee del .env (DATABASE_URL), así la clave no se escribe dos veces.
$linea = Get-Content -Path ".env" | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $linea) { throw "No se encontró DATABASE_URL en el archivo .env de esta carpeta." }
$url = ($linea -split "=", 2)[1].Trim().Trim('"')

$pgDump = Join-Path $PgBin "pg_dump.exe"
if (-not (Test-Path $pgDump)) { throw "No se encontró $pgDump. Indique la carpeta con -PgBin (donde está pg_dump.exe)." }

New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$archivo = Join-Path $Destino ("seguros-" + (Get-Date -Format "yyyy-MM-dd_HHmm") + ".backup")
& $pgDump --format=custom --no-owner --file="$archivo" --dbname="$url"
if ($LASTEXITCODE -ne 0) { throw "pg_dump terminó con error." }
Write-Host "Respaldo creado: $archivo" -ForegroundColor Green

# Conserva los últimos 30 respaldos.
Get-ChildItem $Destino -Filter "seguros-*.backup" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item
