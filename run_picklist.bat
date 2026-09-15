@echo off
cd /d "%~dp0"
python generate_picklist.py %1
echo.
pause
