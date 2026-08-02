#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[desktop] starting Vite on http://127.0.0.1:5175 ..."
cd "$ROOT/svelte"
bun run dev:desktop &
VITE_PID=$!

cleanup() {
  kill "$VITE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:5175/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! curl -sf "http://127.0.0.1:5175/" >/dev/null 2>&1; then
  echo "[desktop] Vite failed to start on :5175" >&2
  exit 1
fi

echo "[desktop] launching Tauri shell ..."
cd "$ROOT/desktop"
exec bunx tauri dev
