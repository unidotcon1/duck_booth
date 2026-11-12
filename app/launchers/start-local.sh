#!/usr/bin/env bash
# Photo Booth launcher for macOS / Linux:  bash app/launchers/start-local.sh
cd "$(dirname "$0")/.." || exit 1
echo; echo " === Photo Booth ==="; echo
if ! command -v node >/dev/null 2>&1; then
  echo " Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then run: bash app/launchers/start-local.sh"
  exit 1
fi
export WRANGLER_SEND_METRICS=false
if [ ! -d node_modules ]; then
  echo " First run: installing, this takes a minute..."
  npm install || { echo " Install failed. Check your internet connection and try again."; exit 1; }
fi
echo " Starting... open http://localhost:8787 in Chrome. Press Ctrl+C to stop."
( sleep 12; (command -v open >/dev/null && open http://localhost:8787) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8787) ) >/dev/null 2>&1 &
npm start
