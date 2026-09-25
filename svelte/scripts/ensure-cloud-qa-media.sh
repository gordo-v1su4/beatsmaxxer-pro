#!/usr/bin/env bash
# Copy committed VP9/WebM + WAV fixtures into the /qa-media fixture root for cloud VMs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_CLIP="$ROOT/tests/fixtures/media-src/qa-clip.webm"
DST_CLIP="$ROOT/tests/fixtures/media/qa-clip.webm"

if [[ ! -f "$SRC_CLIP" ]]; then
  echo "ensure-cloud-qa-media: missing $SRC_CLIP" >&2
  exit 1
fi

if [[ ! -f "$DST_CLIP" ]] || ! cmp -s "$SRC_CLIP" "$DST_CLIP"; then
  cp "$SRC_CLIP" "$DST_CLIP"
  echo "ensure-cloud-qa-media: synced qa-clip.webm"
fi
