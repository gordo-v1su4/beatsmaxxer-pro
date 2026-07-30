#!/usr/bin/env bash
# Open Beat Surfer Pro in the system default browser (native window, not headless CDP).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${1:-http://127.0.0.1:5174/?qa=1&qaAutoplay=1}"

if ! curl -sf "http://127.0.0.1:5174/" >/dev/null 2>&1; then
  echo "Starting dev server..."
  cd "$ROOT"
  bun run dev --host 127.0.0.1 &
  for _ in $(seq 1 40); do
    curl -sf "http://127.0.0.1:5174/" >/dev/null 2>&1 && break
    sleep 0.25
  done
fi

echo "Opening: $URL"
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
else
  echo "No open/xdg-open found. Paste into your browser:" >&2
  echo "$URL" >&2
  exit 1
fi
