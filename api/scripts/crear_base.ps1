# Instala pgvector en PostgreSQL 18 y crea la base "yachi" con su usuario (contraseña tomada de api/.env).
# Necesita permisos de administrador (para copiar pgvector a Program Files) y la contraseña del superusuario postgres.
$ErrorActionPreference = 'Stop'
$api = Split-Path -Parent $PSScriptRoot
$pg = 'C:\Program Files\PostgreSQL\18'

# 1. Pedir elevación si no la tiene (aparece la ventana de Windows "¿Permitir cambios?").
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`""
  exit
}

try {
  Write-Host ''
  Write-Host '== Yachi: base de datos ==' -ForegroundColor Cyan

  # 2. pgvector (compilado para PostgreSQL 18 en api/vendor/pgvector).
  $vendor = Join-Path $api 'vendor\pgvector'
  if (Test-Path (Join-Path $vendor 'vector.dll')) {
    Copy-Item (Join-Path $vendor 'vector.dll') (Join-Path $pg 'lib') -Force
    Copy-Item (Join-Path $vendor 'vector.control') (Join-Path $pg 'share\extension') -Force
    Copy-Item (Join-Path $vendor 'sql\vector--*.sql') (Join-Path $pg 'share\extension') -Force
    Write-Host 'pgvector instalado en PostgreSQL 18.' -ForegroundColor Green
  } else {
    Write-Host 'No encontré api\vendor\pgvector (la búsqueda vectorial usará el modo en memoria).' -ForegroundColor Yellow
  }

  # 3. Contraseña del usuario yachi desde api/.env (no se muestra).
  $line = (Get-Content (Join-Path $api '.env') -Encoding UTF8 | Where-Object { $_ -like 'DATABASE_URL=*' }) -replace '^DATABASE_URL=', ''
  if ($line -notmatch '^postgresql://yachi:([^@]+)@') { throw 'No encuentro la contraseña de yachi en api/.env' }
  $yachiPwd = $Matches[1]

  $sql = @"
DO `$`$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yachi') THEN CREATE ROLE yachi LOGIN PASSWORD '$yachiPwd';
  ELSE ALTER ROLE yachi PASSWORD '$yachiPwd'; END IF;
END `$`$;
SELECT 'CREATE DATABASE yachi OWNER yachi ENCODING ''UTF8'' TEMPLATE template0' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'yachi') \gexec
\connect yachi
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
GRANT ALL ON SCHEMA public TO yachi;
"@
  Write-Host ''
  Write-Host 'Escribe la contraseña del usuario postgres (la que pusiste al instalar PostgreSQL) y presiona Enter:' -ForegroundColor Cyan
  $sql | & (Join-Path $pg 'bin\psql.exe') -U postgres -h localhost -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw 'psql terminó con error (¿contraseña de postgres incorrecta?).' }
  Set-Content -Path (Join-Path $api '.cache-db-ok') -Value 'ok'
  Write-Host ''
  Write-Host 'Listo: base "yachi" creada con pgvector. Ya puedes cerrar esta ventana y avisar en el chat.' -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
Read-Host 'Presiona Enter para cerrar'
