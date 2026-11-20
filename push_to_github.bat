@echo off
title Push to GitHub - Metro POS System
color 0B
echo ===============================================================
echo            PUSHING TO GITHUB (Masitha200/POS-System)
echo ===============================================================
echo.

set "GIT_CMD=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"

if not exist "%GIT_CMD%" (
    where git >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        set "GIT_CMD=git"
    ) else (
        echo [!] Git not found.
        pause
        exit /b 1
    )
)

echo [+] Using Git: "%GIT_CMD%"
echo [+] Remote: https://github.com/Masitha200/POS-System.git
echo [!] A browser window may open asking to 'Sign in with your browser'
echo.

"%GIT_CMD%" push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===============================================================
    echo [✓] SUCCESS! Repository pushed successfully to GitHub!
    echo URL: https://github.com/Masitha200/POS-System
    echo ===============================================================
) else (
    echo.
    echo [!] Push encountered an issue or authorization was cancelled.
)

echo.
pause
