@echo off
title Photo Booth
cd /d "%~dp0.."
echo.
echo  === Photo Booth ===
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed.
  echo  1. Download the LTS version from https://nodejs.org
  echo  2. Install it, then double-click start-tunnel.bat again.
  echo.
  pause
  exit /b 1
)
set WRANGLER_SEND_METRICS=false
if not exist node_modules (
  echo  First run: installing, this takes a minute...
  call npm install
  if errorlevel 1 (
    echo  Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo  Starting... your browser opens in a few seconds.
echo  Keep this window open while you use the booth. Close it (or press Ctrl+C) to stop.
echo.
start "" cmd /c "timeout /t 12 /nobreak >nul & start http://localhost:8787"
call npm start
pause
