#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
PORT="${PORT:-4173}"
URL="http://localhost:${PORT}"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$URL" || true
fi
python3 -m http.server "$PORT"
