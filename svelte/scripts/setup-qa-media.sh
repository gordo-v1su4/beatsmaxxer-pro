#!/usr/bin/env bash
# Cloud-friendly QA media setup — no Mac-specific paths required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MEDIA="$ROOT/tests/fixtures/media"
mkdir -p "$MEDIA"

SRC="${SRC:-/workspace/tests/fixtures/media}"
if [[ ! -f "$SRC/gem-test-720p30.mp4" && -f "$MEDIA/gem-test-720p30.mp4" ]]; then
  SRC="$MEDIA"
fi

if [[ ! -f "$SRC/gem-test-720p30.mp4" ]]; then
  echo "Generating minimal test video with ffmpeg..." >&2
  command -v ffmpeg >/dev/null || { sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg; }
  ffmpeg -y -f lavfi -i "testsrc=size=640x360:rate=30:duration=3" -pix_fmt yuv420p "$MEDIA/gem-test-720p30.mp4" 2>/dev/null
  ffmpeg -y -f lavfi -i "sine=frequency=440:duration=5" "$MEDIA/gem-test-tone.wav" 2>/dev/null
  SRC="$MEDIA"
fi

for i in 1 2 3 4 5 6 7 8; do
  cp -f "$SRC/gem-test-720p30.mp4" "$MEDIA/clip$i.mp4"
done

if [[ -f "$SRC/gem-test-tone.wav" ]]; then
  cp -f "$SRC/gem-test-tone.wav" "$MEDIA/redline.wav"
elif [[ -f "$SRC/redline.wav" ]]; then
  cp -f "$SRC/redline.wav" "$MEDIA/redline.wav"
fi

cat > "$MEDIA/manifest.json" << 'EOF'
{
  "clips": ["clip1.mp4","clip2.mp4","clip3.mp4","clip4.mp4","clip5.mp4","clip6.mp4","clip7.mp4","clip8.mp4"],
  "audio": "redline.wav",
  "audios": ["redline.wav"]
}
EOF

echo "QA media ready in $MEDIA"
ls -la "$MEDIA"/*.mp4 "$MEDIA"/*.wav "$MEDIA"/manifest.json 2>/dev/null | head -20
echo ""
echo "Dev URL: http://localhost:5174/?qa=1&qaAutoplay=1"
