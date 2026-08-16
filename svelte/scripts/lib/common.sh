#!/usr/bin/env bash
# Shared helpers for local browser acceptance scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEV_URL="${DEV_URL:-http://127.0.0.1:5174/}"
QA_URL="${QA_URL:-http://127.0.0.1:5174/?qa=1&qaAutoplay=1}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT/.artifacts}"

BMX_DEV_PID=""
BMX_DEV_STARTED=0

ensure_qa_media() {
  bash "$ROOT/scripts/setup-qa-media.sh"
}

wait_for_dev_server() {
  local tries="${1:-60}"
  for _ in $(seq 1 "$tries"); do
    if curl -sf "$DEV_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  echo "Timed out waiting for dev server at $DEV_URL" >&2
  return 1
}

ensure_dev_server() {
  if curl -sf "$DEV_URL" >/dev/null 2>&1; then
    echo "[local] dev server already running at $DEV_URL"
    return 0
  fi

  echo "[local] starting dev server on :5174 ..."
  cd "$ROOT"
  bun run dev --host 127.0.0.1 &
  BMX_DEV_PID=$!
  BMX_DEV_STARTED=1
  wait_for_dev_server 80
  echo "[local] dev server ready"
}

cleanup_dev_server() {
  if [[ "$BMX_DEV_STARTED" == "1" && -n "$BMX_DEV_PID" ]]; then
    kill "$BMX_DEV_PID" 2>/dev/null || true
    wait "$BMX_DEV_PID" 2>/dev/null || true
  fi
}

require_chrome() {
  if command -v google-chrome >/dev/null 2>&1; then return 0; fi
  if command -v chromium >/dev/null 2>&1; then return 0; fi
  if command -v chromium-browser >/dev/null 2>&1; then return 0; fi
  echo "Chrome/Chromium not found. Install Google Chrome or set CHROME_PATH." >&2
  echo "  macOS: bundled Chrome at /Applications/Google Chrome.app" >&2
  echo "  Linux: sudo apt install chromium-browser" >&2
  return 1
}

ensure_artifacts_dir() {
  mkdir -p "$ARTIFACT_DIR"
}

cleanup_stale_test_chrome() {
  # Exact browser PIDs are owned and terminated by withChrome.
  :
}
