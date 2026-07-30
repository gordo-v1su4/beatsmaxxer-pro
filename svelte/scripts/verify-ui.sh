#!/usr/bin/env bash
set -euo pipefail
URL="${1:-http://localhost:5174/?qa=1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHOT="$ROOT/.verify-ui.png"
code=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
[[ "$code" == "200" ]] || { echo "FAIL HTTP $code"; exit 1; }
command -v agent-browser >/dev/null || { echo "HTTP OK (no agent-browser)"; exit 0; }
agent-browser open "$URL"
agent-browser wait --load networkidle
agent-browser eval '!document.body.innerText.includes("Probing WebGPU") ? "OK" : "STUCK"' | grep -q OK || { echo "FAIL: stuck on WebGPU probe"; agent-browser close; exit 1; }
agent-browser eval '["BEATSURFING","PGM SOURCE","TRANSITION"].every(t=>document.body.innerText.includes(t))' | grep -q true || { echo "FAIL: missing UI"; exit 1; }
agent-browser screenshot "$SHOT"
agent-browser close
echo "PASS — screenshot: $SHOT"
