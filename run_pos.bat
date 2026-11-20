@echo off
setlocal enabledelayedexpansion
title Metro Retail POS System
color 0A

echo ===============================================================
echo            METRO RETAIL MART - POINT OF SALE (POS)
echo ===============================================================
echo  Detecting Python runtime...

set "PY_CMD="

:: 1. Check user specific Python installations (avoiding WindowsApps store stub)
if exist "%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe" (
    set "PY_CMD=%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe"
    goto FOUND
)

for /d %%D in ("%LOCALAPPDATA%\Python\pythoncore-*") do (
    if exist "%%D\python.exe" (
        set "PY_CMD=%%D\python.exe"
        goto FOUND
    )
)

for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python*") do (
    if exist "%%D\python.exe" (
        set "PY_CMD=%%D\python.exe"
        goto FOUND
    )
)

for /d %%D in ("%ProgramFiles%\Python*") do (
    if exist "%%D\python.exe" (
        set "PY_CMD=%%D\python.exe"
        goto FOUND
    )
)

:: 2. Test standard python command if not dummy WindowsApps alias
python -c "import sys; sys.exit(0)" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "PY_CMD=python"
    goto FOUND
)

:: 3. Test py launcher
py -c "import sys; sys.exit(0)" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set "PY_CMD=py"
    goto FOUND
)

echo [!] Error: Real Python installation not found.
echo Please install Python from https://www.python.org/downloads/
echo and check "Add Python to PATH".
echo.
pause
exit /b 1

:FOUND
echo [+] Found working Python: "%PY_CMD%"
echo [+] Starting Metro Retail POS System...
echo.
"%PY_CMD%" run_pos.py
pause
