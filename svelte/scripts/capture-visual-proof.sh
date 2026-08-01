#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/lib/common.sh"
trap cleanup_dev_server EXIT

if [[ "${HEADLESS:-0}" == "1" ]]; then
  echo "Physical-browser visual proof cannot run headless." >&2
  exit 1
fi
if [[ "${PHYSICAL_BROWSER_OBSERVED:-0}" != "1" || -z "${PHYSICAL_BROWSER_OPERATOR:-}" ]]; then
  echo "Set PHYSICAL_BROWSER_OBSERVED=1 and PHYSICAL_BROWSER_OPERATOR=<name> while observing the headed browser." >&2
  exit 1
fi
if [[ "${PHYSICAL_BROWSER_LAG_OBSERVED:-}" != "0" ]]; then
  echo "Set PHYSICAL_BROWSER_LAG_OBSERVED=0 only while directly observing smooth headed playback; use 1 to block on visible lag." >&2
  exit 1
fi

export HEADLESS=0
REAL_MEDIA_ROOT="$ROOT/../.artifacts/real-media"
if [[ ! -f "$REAL_MEDIA_ROOT/audio/Redline (Remastered).mp3" ]]; then
  echo "Missing staged real audio: $REAL_MEDIA_ROOT/audio/Redline (Remastered).mp3" >&2
  exit 1
fi
real_video_count="$(find "$REAL_MEDIA_ROOT/videos" -maxdepth 1 -type f -name '*.mp4' | wc -l | tr -d ' ')"
if [[ "$real_video_count" != "13" ]]; then
  echo "Physical proof requires exactly 13 staged real MP4 files; found $real_video_count" >&2
  exit 1
fi
command -v ffprobe >/dev/null || { echo 'ffprobe is required to verify real-media metadata.' >&2; exit 1; }
ensure_qa_media
ensure_artifacts_dir
printf '%s\n' '[visual-proof] creating source-bound production build'
bun run build
cleanup_stale_test_chrome
ensure_dev_server
export QA_URL ARTIFACT_DIR

bun scripts/capture-visual-proof-runner.ts
bun scripts/verify-visual-proof-runner.ts
