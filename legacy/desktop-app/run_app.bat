@echo off
REM Launcher for the UTEONT desktop app.
REM Works from any cwd — cd's to this script's own directory first.
cd /d "%~dp0"
python -m app
if errorlevel 1 pause
