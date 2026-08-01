#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/lib/common.sh"
trap cleanup_dev_server EXIT
[[ "${HEADLESS:-0}" != "1" ]] || { echo 'Eight-video proof requires headed Chrome.' >&2; exit 1; }
# Capture machine evidence first. Verification remains blocked until a real
# observer attests the completed headed run in the report.
command -v ffprobe >/dev/null || { echo 'ffprobe is required.' >&2; exit 1; }
[[ -f "$ROOT/../.artifacts/real-media/audio/Redline (Remastered).mp3" ]] || { echo 'Missing Redline real-media fixture.' >&2; exit 1; }
count="$(find "$ROOT/../.artifacts/real-media/videos" -maxdepth 1 -type f -name '*.mp4' | wc -l | tr -d ' ')"
(( count >= 8 )) || { echo "Eight-video proof requires at least 8 MP4s; found $count." >&2; exit 1; }
export HEADLESS=0
bun run build
ensure_dev_server
bun scripts/capture-eight-video-proof-runner.ts
bun scripts/verify-eight-video-proof-runner.ts
