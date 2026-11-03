param(
    [int]$Port = 8765,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$env:PYTHONUTF8 = "1"

$python = Join-Path $root ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "First run: creating Python environment..." -ForegroundColor Cyan
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create .venv. Make sure Python 3.11+ is installed."
    }
    & $python -m pip install --upgrade pip
    & $python -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Trying the Tsinghua PyPI mirror..." -ForegroundColor Yellow
        & $python -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
        if ($LASTEXITCODE -ne 0) {
            throw "Python dependencies could not be installed."
        }
    }
}

if (-not (Test-Path (Join-Path $root "web\dist\index.html"))) {
    Write-Host "First run: building the web UI..." -ForegroundColor Cyan
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm was not found. Install Node.js 20+ and run this again."
    }
    Push-Location (Join-Path $root "web")
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "UI build failed." }
    }
    finally {
        Pop-Location
    }
}

$localUrl = "http://127.0.0.1:$Port"
$healthUrl = "$localUrl/api/health"

try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    if ($health.status -eq "ok") {
        Write-Host "SeeEnglish is already running at $localUrl" -ForegroundColor Green
        if (-not $NoOpen) {
            Start-Process $localUrl
        }
        exit 0
    }
}
catch {
    # Nothing is listening yet; continue and start the server.
}

$arguments = @("app.py", "--port", "$Port")
if (-not $NoOpen) {
    $arguments += "--open"
}

& $python $arguments
