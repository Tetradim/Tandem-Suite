@echo off
setlocal
title Sentinel Tandem Suite
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-Sentinel-Tandem.ps1"
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" (
  echo.
  echo Sentinel Tandem Suite launcher exited with code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
