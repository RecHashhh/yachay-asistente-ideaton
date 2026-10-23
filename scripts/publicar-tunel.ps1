# Publica Yachi por https con túneles rápidos de Cloudflare (sin cuenta ni tarjeta), para probarlo desde cualquier
# computadora o celular, incluido el modo voz. Uso, desde la raíz del repositorio:
#   powershell -ExecutionPolicy Bypass -File scripts\publicar-tunel.ps1
# Requiere api\.venv, api\.env (base de datos, clave, MAPS_DATABASE_URL si hay rutas) y web\node_modules.
# Las direcciones cambian en cada ejecución. La PC debe seguir encendida y conectada mientras se use.

param([int]$ApiPort = 8020, [int]$WebPort = 5190)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$api = Join-Path $root 'api'
$web = Join-Path $root 'web'
$python = Join-Path $api '.venv\Scripts\python.exe'
$tools = Join-Path $env:LOCALAPPDATA 'yachi-tools'
$cloudflared = Join-Path $tools 'cloudflared.exe'
$dist = Join-Path $env:TEMP 'yachi-tunel'

# 1. cloudflared oficial (se descarga una sola vez y se verifica la firma de Cloudflare).
if (-not (Test-Path $cloudflared)) {
  New-Item -ItemType Directory -Force $tools | Out-Null
  Invoke-WebRequest -UseBasicParsing 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared
}
$sig = Get-AuthenticodeSignature $cloudflared
if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'Cloudflare') { throw 'La firma de cloudflared no es válida.' }

# 2. Cierra lo que dejó una ejecución anterior de este script (solo procesos propios en estos puertos y los túneles).
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
Get-NetTCPConnection -LocalPort $ApiPort, $WebPort -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" } |
  Where-Object { $_.CommandLine -match 'uvicorn app.main:app|http.server' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false }
Start-Sleep -Seconds 1

# 3. Base de mapas en Docker (rutas). Si Docker no está, el chat funciona igual sin dibujar rutas.
try { docker start yachi-maps-db 2>$null | Out-Null } catch { Write-Host 'Docker no disponible: sin rutas en el mapa.' }

function Start-Tunnel([int]$port, [string]$name) {
  $log = Join-Path $env:TEMP "tunel-$name.log"
  Remove-Item $log -ErrorAction SilentlyContinue
  Start-Process -FilePath $cloudflared -ArgumentList 'tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', "http://127.0.0.1:$port" `
    -WindowStyle Hidden -RedirectStandardError $log -RedirectStandardOutput (Join-Path $env:TEMP "tunel-$name.out.log")
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($m) { return $m.Matches[0].Value }
  }
  throw "No se obtuvo la dirección del túnel $name (ver $log)."
}

# 4. Túneles: uno para la API y otro para la página.
$apiUrl = Start-Tunnel $ApiPort 'api'
$webUrl = Start-Tunnel $WebPort 'web'

# 5. API con permiso CORS para la página del túnel y la IP real de cada visitante.
$env:FRONTEND_ORIGIN = $webUrl
$env:CORS_ORIGINS = 'http://localhost:5180,http://127.0.0.1:5180'
$env:TRUST_PROXY = 'true'
Start-Process -FilePath $python -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', $ApiPort, '--proxy-headers', '--forwarded-allow-ips', '127.0.0.1' `
  -WorkingDirectory $api -WindowStyle Minimized `
  -RedirectStandardOutput (Join-Path $env:TEMP 'yachi-api.out.log') -RedirectStandardError (Join-Path $env:TEMP 'yachi-api.err.log')

# 6. Página compilada para la API del túnel y servida solo en local (el túnel la publica).
Push-Location $web
$env:VITE_API_URL = $apiUrl
npx vite build --outDir $dist --emptyOutDir | Out-Null
Pop-Location
Start-Process -FilePath $python -ArgumentList '-m', 'http.server', $WebPort, '--bind', '127.0.0.1' -WorkingDirectory $dist -WindowStyle Minimized

# 7. Espera a que la API (y el túnel) respondan desde afuera.
$ok = $false
for ($i = 0; $i -lt 90; $i++) {
  try { if ((Invoke-WebRequest -UseBasicParsing "$apiUrl/health" -TimeoutSec 5).StatusCode -eq 200) { $ok = $true; break } } catch { }
  Start-Sleep -Seconds 2
}

# 8. Códigos QR en Descargas (segno se instala en el venv si falta).
& $python -m pip install -q segno 2>$null | Out-Null
$downloads = Join-Path $env:USERPROFILE 'Downloads'
$stamp = Get-Date -Format 'HHmm'  # nombre nuevo en cada ejecución: un QR anterior abierto en el visor no bloquea el guardado
& $python -c "import segno,sys; segno.make(sys.argv[1], error='m').save(sys.argv[3], scale=12, border=3); segno.make(sys.argv[1] + '/#/voz', error='m').save(sys.argv[2], scale=12, border=3)" `
  $webUrl (Join-Path $downloads "QR-Yachi-voz-$stamp.png") (Join-Path $downloads "QR-Yachi-chat-$stamp.png")

Write-Host ''
if ($ok) { Write-Host 'Yachi está en línea:' -ForegroundColor Green } else { Write-Host 'Los túneles están abiertos, pero la API aún no responde desde afuera; espera un minuto y recarga.' -ForegroundColor Yellow }
Write-Host "  Chat:   $webUrl"
Write-Host "  Voz:    $webUrl/#/voz"
Write-Host "  Portal: $webUrl/#/admin"
Write-Host "  QR en:  $downloads (QR-Yachi-chat-$stamp.png, QR-Yachi-voz-$stamp.png)"
Write-Host 'Para detener: cierre los procesos cloudflared, uvicorn (puerto 8020) y http.server (puerto 5190).'
