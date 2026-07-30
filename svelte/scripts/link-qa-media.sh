#!/usr/bin/env bash
# Symlink local test media into tests/fixtures/media for QA dev mode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURES="$ROOT/tests/fixtures/media"
ARCHIVE="${ARCHIVE:-$HOME/Downloads/archive (2)}"
REDLINE="${REDLINE:-$HOME/Music/Music/Media.localized/Music/gordogonzalez/Unknown Album/Redline (Remastered).mp3}"

if [[ ! -d "$ARCHIVE" ]]; then
  echo "Archive not found: $ARCHIVE" >&2
  echo "Set ARCHIVE= to your video folder." >&2
  exit 1
fi

mkdir -p "$FIXTURES"
i=1
shopt -s nullglob
for f in "$ARCHIVE"/*.mp4; do
  [[ $i -gt 8 ]] && break
  ln -sf "$f" "$FIXTURES/clip$i.mp4"
  echo "clip$i.mp4 -> $(basename "$f")"
  i=$((i + 1))
done

if [[ -f "$REDLINE" ]]; then
  ln -sf "$REDLINE" "$FIXTURES/redline.mp3"
  echo "redline.mp3 -> $(basename "$REDLINE")"
else
  echo "Redline not found: $REDLINE" >&2
fi

echo ""
echo "QA URL: http://localhost:5174/?qa=1&qaAutoplay=1 (BPM 133, Redline, 8 clips)"
