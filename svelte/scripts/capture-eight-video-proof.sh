#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/lib/common.sh"
trap cleanup_production_preview EXIT
[[ "${HEADLESS:-0}" != "1" ]] || { echo 'Eight-video proof requires headed Chrome.' >&2; exit 1; }
# Capture machine evidence first. Verification remains blocked until a real
# observer attests the completed headed run in the report.
command -v ffprobe >/dev/null || { echo 'ffprobe is required.' >&2; exit 1; }
bun scripts/verify-redline-proof-media.ts
export HEADLESS=0
unset QA_AUTOPLAY_BYPASS
bun run build
ensure_production_preview
bun scripts/capture-eight-video-proof-runner.ts
bun scripts/verify-eight-video-proof-runner.ts
