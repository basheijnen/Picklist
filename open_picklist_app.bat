@echo off
cd /d "%~dp0"
python webapp_server.py
if errorlevel 1 (
  echo.
  echo FOUT: de Picklist-app kon niet worden gestart.
  pause
)
