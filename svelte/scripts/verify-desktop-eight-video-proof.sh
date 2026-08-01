#!/usr/bin/env bash
# Desktop eight-video proof gate — runs on macOS with native decode backend.
# Cloud agents must not claim this passed; use verify-cloud-smoke.sh instead.
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▶ vitest (desktop runtime label gate)"
bun run test tests/unit/qa/eight-video-proof.test.ts

echo "▶ bsp-decode unit tests"
(cd ../crates/bsp-decode && cargo test)

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "verify-desktop-eight-video-proof: skipped full Tauri shell (requires macOS)" >&2
  exit 0
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "verify-desktop-eight-video-proof: cargo not found" >&2
  exit 1
fi

echo "verify-desktop-eight-video-proof: unit gates passed (headed capture still required on Mac)"
