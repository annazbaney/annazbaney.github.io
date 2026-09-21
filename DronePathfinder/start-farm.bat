@echo off
cd /d "%~dp0"
start "" http://127.0.0.1:8765/
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-farm.ps1"
pause
