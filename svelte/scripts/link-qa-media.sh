#!/usr/bin/env bash
# Symlink local test media into tests/fixtures/media for QA dev mode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURES="$ROOT/tests/fixtures/media"
ARCHIVE="${ARCHIVE:-$HOME/Downloads/archive (2)}"
REDLINE="${REDLINE:-$HOME/Music/Music/Media.localized/Music/Unknown Artist/Unknown Album/Redline.wav}"

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
  ln -sf "$REDLINE" "$FIXTURES/redline.wav"
  echo "redline.wav -> $REDLINE"
else
  echo "Redline not found: $REDLINE" >&2
  echo "Set REDLINE= to your test audio file." >&2
fi

cat > "$FIXTURES/manifest.json" << 'EOF'
{
  "clips": ["clip1.mp4","clip2.mp4","clip3.mp4","clip4.mp4","clip5.mp4","clip6.mp4","clip7.mp4","clip8.mp4"],
  "audio": "redline.wav",
  "audios": ["redline.wav"]
}
EOF

echo ""
echo "QA URL: http://127.0.0.1:5174/?qa=1 (Redline.wav + 8 clips; BPM from Essentia)"
