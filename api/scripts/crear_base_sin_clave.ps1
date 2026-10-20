# Plan B: crea la base "yachi" sin la contraseña de postgres.
# Durante unos segundos permite conexiones LOCALES sin contraseña (trust, solo 127.0.0.1/::1), crea la base y el usuario,
# y restaura pg_hba.conf original. Necesita permisos de administrador.
$ErrorActionPreference = 'Stop'
$api = Split-Path -Parent $PSScriptRoot
$pg = 'C:\Program Files\PostgreSQL\18'
$hba = Join-Path $pg 'data\pg_hba.conf'
$svc = 'postgresql-x64-18'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`""
  exit
}

$backup = "$hba.yachi-backup"
try {
  Write-Host ''
  Write-Host '== Yachi: base de datos (sin contraseña de postgres) ==' -ForegroundColor Cyan

  $line = (Get-Content (Join-Path $api '.env') -Encoding UTF8 | Where-Object { $_ -like 'DATABASE_URL=*' }) -replace '^DATABASE_URL=', ''
  if ($line -notmatch '^postgresql://yachi:([^@]+)@') { throw 'No encuentro la contraseña de yachi en api/.env' }
  $yachiPwd = $Matches[1]

  # 1. Respaldo y acceso local temporal sin contraseña.
  Copy-Item $hba $backup -Force
  $orig = Get-Content $hba -Raw
  $tmp = "host all postgres 127.0.0.1/32 trust`r`nhost all postgres ::1/128 trust`r`n" + $orig
  Set-Content -Path $hba -Value $tmp -Encoding ASCII
  Restart-Service $svc -Force
  for ($i = 0; $i -lt 30; $i++) { & (Join-Path $pg 'bin\pg_isready.exe') -h 127.0.0.1 -q; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Seconds 1 }

  # 2. Crear usuario, base y extensiones.
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
  $sql | & (Join-Path $pg 'bin\psql.exe') -U postgres -h 127.0.0.1 -w -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw 'psql terminó con error al crear la base.' }
  Set-Content -Path (Join-Path $api '.cache-db-ok') -Value 'ok'
  Write-Host 'Base "yachi" creada con pgvector.' -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
} finally {
  # 3. Restaurar SIEMPRE la configuración original.
  if (Test-Path $backup) {
    Copy-Item $backup $hba -Force
    Remove-Item $backup -Force
    Restart-Service $svc -Force
    Write-Host 'Configuración de acceso de PostgreSQL restaurada (vuelve a pedir contraseña).' -ForegroundColor Green
  }
}
Read-Host 'Presiona Enter para cerrar y avisa en el chat'
