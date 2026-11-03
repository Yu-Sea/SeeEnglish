@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=

if not exist "gui\dist\index.html" (
  call npm --prefix gui run build
  if errorlevel 1 pause & exit /b 1
)

"gui\node_modules\electron\dist\electron.exe" "gui"
pause
