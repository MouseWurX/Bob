@echo off
rem Bob from the command line (src\bob-cli.js): bob ask "question", bob status, bob models.
rem Uses the Node inside Bob.exe when Bob is installed, else Node from PATH (a copy of the source).
setlocal
set "BOBCLI=%~dp0..\src\bob-cli.js"
if exist "%~dp0..\..\..\Bob.exe" (
  set ELECTRON_RUN_AS_NODE=1
  "%~dp0..\..\..\Bob.exe" "%BOBCLI%" %*
) else (
  node "%BOBCLI%" %*
)
exit /b %ERRORLEVEL%
