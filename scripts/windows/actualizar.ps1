# Actualiza el sistema de seguros a la versión nueva (servidor Windows).
# Uso (PowerShell, en la carpeta del sistema):   .\scripts\windows\actualizar.ps1
# Pasos: respaldo → descarga la versión nueva → instala → aplica cambios en la base → compila → reinicia.
$ErrorActionPreference = "Stop"
function Paso($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
function Ejecutar($comando) {
  cmd /c $comando
  if ($LASTEXITCODE -ne 0) { throw "Falló: $comando. El sistema anterior sigue funcionando; revise el mensaje de arriba." }
}

Paso "1/6 Respaldo de la base"
& "$PSScriptRoot\respaldar.ps1"

Paso "2/6 Descargando la versión nueva"
Ejecutar "git pull"

Paso "3/6 Instalando dependencias"
Ejecutar "npm ci"

Paso "4/6 Actualizando la base de datos"
Ejecutar "npm run instalar"

Paso "5/6 Compilando"
Ejecutar "npm run build"

Paso "6/6 Reiniciando el sistema"
Ejecutar "pm2 restart seguros"
Write-Host "`nListo: el sistema ya tiene la versión nueva." -ForegroundColor Green
