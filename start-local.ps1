# Starts the Quran Farouq app locally: MongoDB (service) + backend + frontend.
# Usage:  right-click > Run with PowerShell, or:  powershell -ExecutionPolicy Bypass -File start-local.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$vpy = Join-Path $backend ".venv\Scripts\python.exe"

Write-Host "== Quran Farouq local launcher ==" -ForegroundColor Cyan

# 1. Ensure MongoDB service is running
$mongo = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
if ($null -eq $mongo) {
    Write-Host "MongoDB service not found. Install MongoDB Community Server first." -ForegroundColor Red
    exit 1
}
if ($mongo.Status -ne "Running") {
    Write-Host "Starting MongoDB service..." -ForegroundColor Yellow
    Start-Service MongoDB
}
Write-Host "MongoDB: running" -ForegroundColor Green

# 2. Start backend (FastAPI on :8001) in its own window
Write-Host "Starting backend on http://localhost:8001 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$backend'; & '$vpy' -m uvicorn server:app --host 0.0.0.0 --port 8001"
)

# 3. Start frontend (React on :3000) in its own window
Write-Host "Starting frontend on http://localhost:3000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$frontend'; `$env:BROWSER='none'; `$env:PORT='3000'; npm start"
)

Write-Host ""
Write-Host "Backend : http://localhost:8001  (health: /health)" -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "Logins:" -ForegroundColor Cyan
Write-Host "  admin   -> admin@faruq.com   / admin123"
Write-Host "  teacher -> teacher@faruq.com / teacher123"
Write-Host "  student -> student@faruq.com / student123"
Write-Host ""
Write-Host "Two new windows opened (backend + frontend). Close them to stop the servers." -ForegroundColor DarkGray
