@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=

if not exist "gui\dist\index.html" (
  echo Building the SeeEnglish GUI for the first time...
  call npm --prefix gui run build
  if errorlevel 1 (
    echo GUI build failed.
    pause
    exit /b 1
  )
)

if not exist "gui\node_modules\electron\dist\electron.exe" (
  echo Electron is not installed.
  echo Run: npm --prefix gui install
  pause
  exit /b 1
)

start "" "gui\node_modules\electron\dist\electron.exe" "gui"
timeout /t 4 /nobreak >nul
tasklist /FI "IMAGENAME eq electron.exe" 2>nul | find /I "electron.exe" >nul
if errorlevel 1 (
  echo Electron window did not stay open; using the Chrome app-window launcher.
  start "" "C:\Windows\System32\wscript.exe" "%~dp0SeeEnglish GUI.vbs"
)
exit /b 0
