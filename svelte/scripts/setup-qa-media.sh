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

if [[ ! -f "$SRC_CLIP" ]]; then
  echo "ERROR: no QA clip source at $SRC_CLIP" >&2
  echo "The VP9 fixture should be committed at tests/fixtures/media-src/qa-clip.webm" >&2
  exit 1
fi

rm -f "$MEDIA"/clip*.mp4 "$MEDIA"/clip*.webm
for i in 1 2 3 4 5 6 7 8; do
  cp -f "$SRC_CLIP" "$MEDIA/clip$i.$EXT"
done

# Keep real song names and generated QA audio separate. A test tone must never
# masquerade as Redline or replace a symlink to the user's master file.
AUDIO_NAME=""
if [[ -n "${QA_AUDIO:-}" ]]; then
  if [[ ! -f "$QA_AUDIO" ]]; then
    echo "ERROR: QA_AUDIO does not exist: $QA_AUDIO" >&2
    exit 1
  fi
  AUDIO_NAME="$(basename "$QA_AUDIO")"
  rm -f "$MEDIA/$AUDIO_NAME"
  ln -s "$QA_AUDIO" "$MEDIA/$AUDIO_NAME"
elif [[ -f "$SRCDIR/qa-audio.wav" ]]; then
  cp -f "$SRCDIR/qa-audio.wav" "$MEDIA/qa-audio.wav"
  AUDIO_NAME="qa-audio.wav"
elif [[ -f "$MEDIA/gem-test-tone.wav" ]]; then
  cp -f "$MEDIA/gem-test-tone.wav" "$MEDIA/qa-audio.wav"
  AUDIO_NAME="qa-audio.wav"
elif command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -y -f lavfi -i "sine=frequency=440:duration=5" "$MEDIA/qa-audio.wav" 2>/dev/null
  AUDIO_NAME="qa-audio.wav"
fi

# Minimal deterministic SMF (format 0, one empty track) for advertised MIDI pickers.
printf '\x4d\x54\x68\x64\x00\x00\x00\x06\x00\x00\x00\x01\x00\x60\x4d\x54\x72\x6b\x00\x00\x00\x04\x00\xff\x2f\x00' > "$MEDIA/qa.mid"

CLIP_LIST=""
for i in 1 2 3 4 5 6 7 8; do
  [[ -n "$CLIP_LIST" ]] && CLIP_LIST="$CLIP_LIST,"
  CLIP_LIST="$CLIP_LIST\"clip$i.$EXT\""
done

cat > "$MEDIA/manifest.json" <<EOF
{
  "clips": [$CLIP_LIST],
  "audio": "${AUDIO_NAME}",
  "midi": "qa.mid",
  "audios": ["${AUDIO_NAME}"]
}
EOF

echo "QA media ready in $MEDIA (.$EXT)"
ls -la "$MEDIA"/clip*."$EXT" "$MEDIA"/manifest.json 2>/dev/null | head -12
echo ""
echo "Dev URL: http://localhost:5174/?qa=1&qaAutoplay=1"
