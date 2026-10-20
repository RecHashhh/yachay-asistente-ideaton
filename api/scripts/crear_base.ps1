# Crea la base "yachi" y su usuario con la contraseña que ya está en api/.env.
# Solo pide la contraseña del superusuario postgres (la escribe la persona, no queda guardada).
$ErrorActionPreference = 'Stop'
$api = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $api '.env'
$line = (Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -like 'DATABASE_URL=*' }) -replace '^DATABASE_URL=', ''
if ($line -notmatch '^postgresql://yachi:([^@]+)@') { Write-Host 'No encuentro la contraseña de yachi en api/.env' -ForegroundColor Red; Read-Host 'Enter para cerrar'; exit 1 }
$pwd = $Matches[1]
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$sql = @"
CREATE ROLE yachi LOGIN PASSWORD '$pwd';
CREATE DATABASE yachi OWNER yachi ENCODING 'UTF8' TEMPLATE template0;
\connect yachi
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT ALL ON SCHEMA public TO yachi;
"@
Write-Host ''
Write-Host 'Creando la base de datos de Yachi en PostgreSQL 18.' -ForegroundColor Cyan
Write-Host 'Escribe la contraseña del usuario postgres (la que pusiste al instalar PostgreSQL) y presiona Enter.' -ForegroundColor Cyan
Write-Host ''
$sql | & $psql -U postgres -h localhost -v ON_ERROR_STOP=1 -q
if ($LASTEXITCODE -eq 0) {
  Write-Host ''
  Write-Host 'Listo: base "yachi" creada. Puedes cerrar esta ventana.' -ForegroundColor Green
  Set-Content -Path (Join-Path $api '.cache-db-ok') -Value 'ok'
} else {
  Write-Host ''
  Write-Host 'No se pudo crear la base (¿contraseña incorrecta o ya existía?).' -ForegroundColor Red
}
Read-Host 'Presiona Enter para cerrar'
