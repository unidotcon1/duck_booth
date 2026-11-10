@echo off
title Photo Booth + tunnel
cd /d "%~dp0"
echo.
echo  === Photo Booth with a public QR address (free Cloudflare quick tunnel) ===
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo  cloudflared is not installed yet.
  echo  1. Open Command Prompt and run:  winget install Cloudflare.cloudflared
  echo  2. Close it, then double-click start-tunnel.bat again.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo  First run: installing, this takes a minute...
  call npm install
)
call npm run tunnel
pause
