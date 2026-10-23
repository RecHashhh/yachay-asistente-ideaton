# Publica Yachi en la red local (Wi-Fi) para que otros dispositivos de la misma red lo prueben.
# Uso, desde la raíz del repositorio:   powershell -ExecutionPolicy Bypass -File scripts\servir-en-red.ps1
# Requiere api\.venv con las dependencias, api\.env con la clave y la base de datos, y web\node_modules.
# Limitación: sin https, el navegador no permite el micrófono (modo voz) en otros dispositivos.

param([int]$ApiPort = 8020, [int]$WebPort = 5180)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$api = Join-Path $root 'api'
$web = Join-Path $root 'web'
$python = Join-Path $api '.venv\Scripts\python.exe'
$dist = Join-Path $env:TEMP 'yachi-lan'

# IP de la interfaz Wi-Fi (o de la primera red activa con puerta de enlace).
$cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|WARP|VirtualBox|VMware' } | Select-Object -First 1
if (-not $cfg) { throw 'No hay una red activa con salida a internet.' }
$ip = $cfg.IPv4Address.IPAddress
Write-Host "Red: $($cfg.InterfaceAlias)  IP: $ip"

# Detiene instancias anteriores de este script (API y servidor estático) en los mismos puertos.
Get-NetTCPConnection -LocalPort $ApiPort, $WebPort -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" } |
  Where-Object { $_.CommandLine -match 'uvicorn app.main:app|http.server' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
Start-Sleep -Seconds 1

# API escuchando en la red, con permiso CORS para la página servida desde la misma IP.
$env:FRONTEND_ORIGIN = "http://${ip}:$WebPort"
$env:CORS_ORIGINS = "http://localhost:$WebPort,http://127.0.0.1:$WebPort"
Start-Process -FilePath $python -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', $ApiPort `
  -WorkingDirectory $api -WindowStyle Minimized `
  -RedirectStandardOutput (Join-Path $env:TEMP 'yachi-api.out.log') -RedirectStandardError (Join-Path $env:TEMP 'yachi-api.err.log')

# Página compilada para esa IP y servida en la red.
Push-Location $web
$env:VITE_API_URL = "http://${ip}:$ApiPort"
npx vite build --outDir $dist --emptyOutDir | Out-Null
Pop-Location
Start-Process -FilePath $python -ArgumentList '-m', 'http.server', $WebPort, '--bind', '0.0.0.0' -WorkingDirectory $dist -WindowStyle Minimized

# Espera a que la API cargue el índice.
for ($i = 0; $i -lt 60; $i++) {
  try { if ((Invoke-WebRequest -UseBasicParsing "http://${ip}:$ApiPort/health" -TimeoutSec 2).StatusCode -eq 200) { break } } catch { }
  Start-Sleep -Seconds 2
}

Write-Host ''
Write-Host "Chat:   http://${ip}:$WebPort" -ForegroundColor Green
Write-Host "Portal: http://${ip}:$WebPort/#/admin" -ForegroundColor Green
Write-Host 'Los dispositivos deben estar en la misma red Wi-Fi. Si no carga, la red aísla a sus clientes: usa el túnel.'
