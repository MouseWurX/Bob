@echo off
rem Kept for old instructions: the same as Install Bob.cmd in the main folder, which is the one to use.
rem Puts this Bob in place. Nothing is built: Bob.exe is Electron's own program.
rem Opens Bob's install window: every step shows with a tick, a progress bar and the live log line.
cd /d "%~dp0.."
where powershell >nul 2>nul
if errorlevel 1 (
  echo  Windows PowerShell is missing, so the install window can't open.
  pause
  exit /b 1
)
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0bob-build-window.ps1" -Mode install
