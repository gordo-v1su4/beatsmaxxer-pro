#!/usr/bin/env bash
# QA media setup that works on ANY machine — no Mac paths, no ffmpeg required.
#
# Codec note: Chromium builds used for automated testing (Playwright/Puppeteer)
# ship WITHOUT proprietary codecs, so H.264 .mp4 clips report
# MEDIA_ERR_SRC_NOT_SUPPORTED and never decode. A gate running those clips can
# only ever prove "nothing threw", not "video played". The committed VP9/WebM
# fixture decodes in every Chromium, so acceptance runs are meaningful anywhere.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MEDIA="$ROOT/tests/fixtures/media"
SRCDIR="$ROOT/tests/fixtures/media-src"
mkdir -p "$MEDIA"

EXT="webm"
SRC_CLIP="$SRCDIR/qa-clip.webm"

# Prefer real footage when a human has it locally (richer than a test pattern),
# but only if this Chromium can actually decode it — otherwise fall back.
if [[ -n "${QA_REAL_MEDIA:-}" && -f "${QA_REAL_MEDIA}" ]]; then
  SRC_CLIP="${QA_REAL_MEDIA}"
  EXT="${QA_REAL_MEDIA##*.}"
  echo "Using real media from QA_REAL_MEDIA: $SRC_CLIP" >&2
fi

if [[ ! -f "$SRC_CLIP" ]]; then
  echo "ERROR: no QA clip source at $SRC_CLIP" >&2
  echo "The VP9 fixture should be committed at tests/fixtures/media-src/qa-clip.webm" >&2
  exit 1
fi

rm -f "$MEDIA"/clip*.mp4 "$MEDIA"/clip*.webm
for i in 1 2 3 4 5 6 7 8; do
  cp -f "$SRC_CLIP" "$MEDIA/clip$i.$EXT"
done

# Audio: reuse a committed wav if present, else synthesise a short tone so the
# transport has something to run against.
if [[ -f "$SRCDIR/qa-audio.wav" ]]; then
  cp -f "$SRCDIR/qa-audio.wav" "$MEDIA/redline.wav"
elif [[ -f "$MEDIA/gem-test-tone.wav" ]]; then
  cp -f "$MEDIA/gem-test-tone.wav" "$MEDIA/redline.wav"
elif command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -y -f lavfi -i "sine=frequency=440:duration=5" "$MEDIA/redline.wav" 2>/dev/null
fi

CLIP_LIST=""
for i in 1 2 3 4 5 6 7 8; do
  [[ -n "$CLIP_LIST" ]] && CLIP_LIST="$CLIP_LIST,"
  CLIP_LIST="$CLIP_LIST\"clip$i.$EXT\""
done

cat > "$MEDIA/manifest.json" <<EOF
{
  "clips": [$CLIP_LIST],
  "audio": "redline.wav",
  "audios": ["redline.wav"]
}
EOF

echo "QA media ready in $MEDIA (.$EXT)"
ls -la "$MEDIA"/clip*."$EXT" "$MEDIA"/manifest.json 2>/dev/null | head -12
echo ""
echo "Dev URL: http://localhost:5174/?qa=1&qaAutoplay=1"
