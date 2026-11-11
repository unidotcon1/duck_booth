@echo off
title Photo Booth
cd /d "%~dp0app"
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
where cloudflared >nul 2>nul
if errorlevel 1 goto :notunnel
if not exist node_modules (
  echo  First run: installing, this takes a minute...
  call npm install
  if errorlevel 1 (
    echo  Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo  Starting the booth with a public QR address (free Cloudflare quick tunnel)...
call npm run tunnel
pause
exit /b 0

:notunnel
echo  The free tunnel program (cloudflared) is not installed on this computer.
echo.
echo    1 = Start the booth WITHOUT the tunnel (phones on the same Wi-Fi only)
echo    2 = Show me how to install the tunnel program
echo.
choice /c 12 /n /m "  Press 1 or 2: "
if errorlevel 2 goto :howto
call "%~dp0app\launchers\start-local.bat"
exit /b 0

:howto
echo.
echo  1. Open Command Prompt and run:  winget install Cloudflare.cloudflared
echo  2. Close it, then double-click start-tunnel.bat again.
echo.
pause
exit /b 0
