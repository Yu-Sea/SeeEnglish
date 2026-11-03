$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$temp = Join-Path $PSScriptRoot 'temp'
New-Item -ItemType Directory -Path $temp -Force | Out-Null

Write-Host '1/4  Building Web UI...'
npm --prefix (Join-Path $root 'web') run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }

Write-Host '2/4  Building desktop GUI...'
npm --prefix (Join-Path $root 'gui') run build
if ($LASTEXITCODE -ne 0) { throw 'GUI build failed.' }

Write-Host '3/4  Building standalone backend...'
& (Join-Path $root '.venv\Scripts\pyinstaller.exe') `
  --noconfirm --clean `
  --distpath (Join-Path $PSScriptRoot 'dist') `
  --workpath (Join-Path $PSScriptRoot 'build') `
  (Join-Path $PSScriptRoot 'SeeEnglishBackend.spec')
if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }

Write-Host '4/4  Packaging Electron app...'
$env:TEMP = $temp
$env:TMP = $temp
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
Push-Location (Join-Path $root 'gui')
try {
  & (Join-Path $root 'gui\node_modules\.bin\electron-builder.cmd') --dir
  if ($LASTEXITCODE -ne 0) { throw 'Electron packaging failed.' }
} finally {
  Pop-Location
}

$makensis = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'electron-builder\Cache') `
  -Recurse -Filter makensis.exe -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $makensis) { throw 'NSIS (makensis.exe) was not found.' }

Write-Host 'Compiling the installer...'
Push-Location (Join-Path $PSScriptRoot 'installer')
try {
  & $makensis (Join-Path $PSScriptRoot 'installer\SeeEnglish.nsi')
  if ($LASTEXITCODE -ne 0) { throw 'NSIS compilation failed.' }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host 'Installer:'
Write-Host (Join-Path $root 'gui\release\SeeEnglish-Setup-0.6.0.exe')
