#!/usr/bin/env bash
# Desktop eight-video proof gate — runs on macOS with native decode backend.
# Cloud agents must not claim this passed; use verify-cloud-smoke.sh instead.
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▶ vitest (desktop runtime label gate)"
bun run test tests/unit/qa/eight-video-proof.test.ts tests/unit/qa/desktop-native-proof-contract.test.ts

echo "▶ bsp-decode unit tests"
(cd ../crates/bsp-decode && cargo test)

echo "▶ Tauri Rust check"
(cd ../desktop/src-tauri && cargo check)

echo "▶ Svelte check"
bun run check

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "verify-desktop-eight-video-proof: skipped full Tauri shell (requires macOS)" >&2
  exit 0
fi

REPORT_PATH="${BSP_DESKTOP_PROOF_PATH:-$ROOT/../.artifacts/desktop-eight-video/report.json}"
REUSE_REPORT="${BSP_DESKTOP_PROOF_REUSE:-0}"

if [[ "$REUSE_REPORT" != "1" ]]; then
  mkdir -p "$(dirname "$REPORT_PATH")"
  rm -f "$REPORT_PATH" "${REPORT_PATH%.json}.json.tmp"
  echo "▶ headed Tauri proof (8 previews + PGM, 30s RAND)"
  BSP_DESKTOP_PROOF_PATH="$REPORT_PATH" \
    DESKTOP_DEV_URL="http://127.0.0.1:5175/?desktopProof=1" \
    "$ROOT/../scripts/dev-desktop.sh" &
  DESKTOP_PID=$!
  cleanup() {
    kill "$DESKTOP_PID" 2>/dev/null || true
    wait "$DESKTOP_PID" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM

  for _ in $(seq 1 720); do
    if [[ -s "$REPORT_PATH" ]]; then
      break
    fi
    if ! kill -0 "$DESKTOP_PID" 2>/dev/null; then
      echo "headed Tauri proof exited before writing a report" >&2
      exit 1
    fi
    sleep 0.25
  done
fi

if [[ ! -s "$REPORT_PATH" ]]; then
  echo "headed Tauri proof did not write $REPORT_PATH" >&2
  exit 1
fi

echo "▶ evaluate headed proof report"
bun scripts/evaluate-desktop-native-proof.ts "$REPORT_PATH"
