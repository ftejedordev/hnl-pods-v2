# HyperNova Pods - Development Startup Script
# Ejecutar desde la raiz del proyecto: .\start-dev.ps1

$projectRoot = $PSScriptRoot
$mongodBin = "$projectRoot\pods\web-ui\src-tauri\binaries\mongod-x86_64-pc-windows-msvc.exe"
$mongoDataDir = "$env:LOCALAPPDATA\com.hypernova-labs.pods\mongodb"
$backendDir = "$projectRoot\pods\rust-backend"
$webUiDir = "$projectRoot\pods\web-ui"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  HyperNova Pods - Dev Environment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Crear directorio de datos de MongoDB si no existe
if (-not (Test-Path $mongoDataDir)) {
    New-Item -ItemType Directory -Path $mongoDataDir -Force | Out-Null
    Write-Host "[OK] Directorio MongoDB creado: $mongoDataDir" -ForegroundColor Green
}

# 1. Iniciar MongoDB
Write-Host "[1/3] Iniciando MongoDB en puerto 27017..." -ForegroundColor Yellow
$mongoProcess = Start-Process -FilePath $mongodBin -ArgumentList "--dbpath", $mongoDataDir, "--port", "27017", "--bind_ip", "127.0.0.1" -PassThru
Write-Host "  PID: $($mongoProcess.Id)" -ForegroundColor DarkGray

# Esperar a que MongoDB este listo
Write-Host "  Esperando que MongoDB arranque..." -ForegroundColor DarkGray
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", 27017)
        $tcp.Close()
        $ready = $true
        break
    } catch {
        # Aun no esta listo
    }
}
if ($ready) {
    Write-Host "[OK] MongoDB listo" -ForegroundColor Green
} else {
    Write-Host "[ERROR] MongoDB no arranco en 15 segundos" -ForegroundColor Red
    exit 1
}

# 2. Iniciar Backend
Write-Host "[2/3] Iniciando Backend Rust en puerto 8000..." -ForegroundColor Yellow
$env:DB_URI_MONGO = "mongodb://localhost:27017/hypernova_pods"
$env:JWT_SECRET_KEY = "hypernova_secret_key_2024_pods"
$env:PORT = "8000"
$env:ENCRYPTION_KEY = "hypernova_encryption_key_2024_pods"
$env:RUST_LOG = "info,pods_backend=debug"

$backendProcess = Start-Process -FilePath "cargo" -ArgumentList "run" -WorkingDirectory $backendDir -PassThru
Write-Host "  PID: $($backendProcess.Id)" -ForegroundColor DarkGray

# Esperar a que el Backend este listo
Write-Host "  Esperando que el Backend compile y arranque..." -ForegroundColor DarkGray
$ready = $false
for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        # Aun compilando o arrancando
    }
}
if ($ready) {
    Write-Host "[OK] Backend listo" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Backend no arranco en 2 minutos" -ForegroundColor Red
    exit 1
}

# 3. Iniciar Tauri Dev
Write-Host "[3/3] Iniciando Tauri App (dev external)..." -ForegroundColor Yellow
$npmPath = "C:\Program Files\nodejs\npm.cmd"
$tauriProcess = Start-Process -FilePath $npmPath -ArgumentList "run", "tauri:dev:external" -WorkingDirectory $webUiDir -PassThru
Write-Host "  PID: $($tauriProcess.Id)" -ForegroundColor DarkGray

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Todo corriendo!" -ForegroundColor Green
Write-Host "  MongoDB:  puerto 27017" -ForegroundColor White
Write-Host "  Backend:  puerto 8000" -ForegroundColor White
Write-Host "  Tauri:    compilando..." -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Presiona Ctrl+C para cerrar todo" -ForegroundColor DarkGray

# Esperar y limpiar al cerrar
try {
    $tauriProcess.WaitForExit()
} finally {
    Write-Host ""
    Write-Host "Cerrando servicios..." -ForegroundColor Yellow

    # Matar procesos
    try { Stop-Process -Name "pods-backend" -Force -ErrorAction SilentlyContinue } catch {}
    try { Stop-Process -Name "mongod-x86_64-pc-windows-msvc" -Force -ErrorAction SilentlyContinue } catch {}
    try { Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue } catch {}

    Write-Host "[OK] Todos los servicios cerrados" -ForegroundColor Green
}
