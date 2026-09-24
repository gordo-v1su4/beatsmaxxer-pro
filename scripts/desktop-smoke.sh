#!/usr/bin/env bash
# Post–test:local Tauri smoke (#25): same Svelte bundle as web, native shell on Windows.
# On macOS/Linux this only verifies the embedded frontend build.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "▶ desktop frontend (TAURI_ENV_PLATFORM=1 build)"
bun run build:desktop-frontend

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*|Windows*)
    echo "▶ tauri build (debug, Windows)"
    cd desktop
    bunx tauri build --debug
    echo "desktop-smoke PASSED (Windows bundle built)"
    ;;
  *)
    echo "desktop-smoke: frontend build OK; full Tauri shell requires Windows (WebView2)."
    echo "Run on 5090/desktop: bash scripts/desktop-smoke.sh"
    exit 0
    ;;
esac
