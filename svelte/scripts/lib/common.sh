#!/usr/bin/env bash
# Shared helpers for local browser acceptance scripts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEV_URL="${DEV_URL:-http://127.0.0.1:5174/}"
QA_URL="${QA_URL:-http://127.0.0.1:5174/?qa=1&qaAutoplay=1}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$ROOT/.artifacts}"

BMX_DEV_PID=""
BMX_DEV_STARTED=0
BMX_PROOF_PID=""
BMX_PROOF_STARTED=0

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

wait_for_production_preview() {
  local tries="${1:-80}"
  for _ in $(seq 1 "$tries"); do
    if [[ -n "$BMX_PROOF_PID" ]] && ! kill -0 "$BMX_PROOF_PID" 2>/dev/null; then
      echo "Production preview exited before becoming ready." >&2
      return 1
    fi
    if curl -sf "$PROOF_SERVER_ORIGIN" >/dev/null 2>&1; then return 0; fi
    sleep 0.25
  done
  echo "Timed out waiting for production preview at $PROOF_SERVER_ORIGIN" >&2
  return 1
}

ensure_production_preview() {
  local proof_port="${PROOF_PORT:-5194}"
  export PROOF_SERVER_ORIGIN="http://127.0.0.1:${proof_port}"
  export PROOF_SERVER_KIND="vite-production-preview"
  export QA_URL="${PROOF_SERVER_ORIGIN}/?qaProof=1"
  if curl -sf "$PROOF_SERVER_ORIGIN" >/dev/null 2>&1; then
    echo "Refusing release capture: port ${proof_port} is already serving an unowned process." >&2
    return 1
  fi
  echo "[proof] starting strict production preview on :${proof_port} ..."
  bun run preview --host 127.0.0.1 --port "$proof_port" --strictPort &
  BMX_PROOF_PID=$!
  BMX_PROOF_STARTED=1
  wait_for_production_preview
  echo "[proof] production preview ready at $PROOF_SERVER_ORIGIN"
}

cleanup_production_preview() {
  if [[ "$BMX_PROOF_STARTED" == "1" && -n "$BMX_PROOF_PID" ]]; then
    kill "$BMX_PROOF_PID" 2>/dev/null || true
    wait "$BMX_PROOF_PID" 2>/dev/null || true
  fi
}

require_chrome() {
  if [[ -n "${CHROME_PATH:-}" && -x "${CHROME_PATH}" ]]; then return 0; fi
  if command -v google-chrome >/dev/null 2>&1; then return 0; fi
  if command -v google-chrome-stable >/dev/null 2>&1; then return 0; fi
  if command -v chromium >/dev/null 2>&1; then return 0; fi
  if command -v chromium-browser >/dev/null 2>&1; then return 0; fi
  if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then return 0; fi
  if [[ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]]; then return 0; fi
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
