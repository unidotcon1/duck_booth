#!/usr/bin/env bash
# Photo Booth + free Cloudflare quick tunnel (macOS / Linux):  bash start-tunnel.sh
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Install Node.js LTS from https://nodejs.org first."; exit 1; }
[ -d node_modules ] || npm install || exit 1
npm run tunnel
