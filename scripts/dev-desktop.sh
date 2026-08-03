#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DEV_URL="${DESKTOP_DEV_URL:-http://127.0.0.1:5175}"
export BSP_DESKTOP_PROOF_PATH="${BSP_DESKTOP_PROOF_PATH:-$ROOT/.artifacts/desktop-eight-video/report.json}"

# Real @tauri-apps/api (not web stubs) + Essentia keys for the Rust analyze_rhythm command.
export TAURI_ENV_PLATFORM=1
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${ESSENTIA_API_BASE_URL:-}" || -z "${ESSENTIA_API_KEY:-}" ]]; then
  echo "[desktop] warning: ESSENTIA_API_BASE_URL / ESSENTIA_API_KEY not set — SONG → ANALYZE will fail" >&2
  echo "[desktop] copy .env.example to .env at repo root and fill in your Essentia host + key" >&2
else
  echo "[desktop] Essentia env loaded (${ESSENTIA_API_BASE_URL})"
fi

echo "[desktop] starting Vite on http://127.0.0.1:5175 ..."
cd "$ROOT/svelte"
bun run dev:desktop &
VITE_PID=$!

cleanup() {
  if [[ -n "${TAURI_PID:-}" ]]; then
    kill "$TAURI_PID" 2>/dev/null || true
  fi
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
bunx tauri dev --config "{\"build\":{\"devUrl\":\"$DESKTOP_DEV_URL\"}}" &
TAURI_PID=$!
wait "$TAURI_PID"
