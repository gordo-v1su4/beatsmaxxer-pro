#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVELTE="$ROOT/svelte"
DEV_HOST="127.0.0.1"
DEV_PORT=5174
APP_PGID=""

cleanup() {
  if [[ -n "$APP_PGID" ]] && kill -0 -- "-$APP_PGID" 2>/dev/null; then
    kill -TERM -- "-$APP_PGID" 2>/dev/null || true
    for _ in $(seq 1 15); do
      kill -0 -- "-$APP_PGID" 2>/dev/null || break
      sleep 0.2
    done
    kill -KILL -- "-$APP_PGID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 143' INT TERM

log_secret() {
  local name="$1"
  if [[ -n "${!name:-}" ]]; then
    echo "[cloud-agent] $name=SET"
  else
    echo "[cloud-agent] $name=MISSING"
  fi
}

echo "[cloud-agent] Beat Surfer Pro — Svelte + WebGPU (web only)"
log_secret ESSENTIA_API_KEY
log_secret ESSENTIA_API_BASE_URL
log_secret TS_AUTHKEY

cd "$SVELTE"
bash scripts/setup-qa-media.sh

if ! curl -sf "http://${DEV_HOST}:${DEV_PORT}/" >/dev/null 2>&1; then
  echo "[cloud-agent] starting vite on ${DEV_HOST}:${DEV_PORT}..."
  setsid bun run dev --host "$DEV_HOST" --port "$DEV_PORT" &
  APP_PGID=$!
  for _ in $(seq 1 80); do
    if curl -sf "http://${DEV_HOST}:${DEV_PORT}/" >/dev/null 2>&1; then
      echo "[cloud-agent] dev server ready at http://${DEV_HOST}:${DEV_PORT}/"
      break
    fi
    sleep 0.25
  done
  curl -sf "http://${DEV_HOST}:${DEV_PORT}/" >/dev/null || {
    echo "[cloud-agent] dev server failed to start on port ${DEV_PORT}" >&2
    exit 1
  }
else
  echo "[cloud-agent] dev server already running on port ${DEV_PORT}"
fi

wait "$APP_PGID" 2>/dev/null || true
