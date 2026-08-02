#!/usr/bin/env bash
# Symlink local test media into tests/fixtures/media for QA dev mode.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURES="$ROOT/tests/fixtures/media"
DOWNLOADS="${HOME}/Downloads"
ARCHIVE="${ARCHIVE:-$DOWNLOADS/archive (2)}"
REDLINE="${REDLINE:-$HOME/Music/Music/Media.localized/Music/Unknown Artist/Unknown Album/new-Redline (Remastered).wav}"
CLIP_COUNT="${CLIP_COUNT:-8}"
MIN_CLIP_BYTES="${MIN_CLIP_BYTES:-100000}"

resolve_archive() {
  if [[ -d "$ARCHIVE" ]]; then
    echo "$ARCHIVE"
    return
  fi
  for candidate in \
    "$DOWNLOADS/archive (2)" \
    "$DOWNLOADS/archive"; do
    if [[ -d "$candidate" ]]; then
      echo "Archive not found at: $ARCHIVE" >&2
      echo "Using fallback: $candidate" >&2
      echo "$candidate"
      return
    fi
  done
  echo "No video archive found. Tried:" >&2
  echo "  $ARCHIVE" >&2
  echo "  $DOWNLOADS/archive (2)" >&2
  exit 1
}

ARCHIVE="$(resolve_archive)"

mkdir -p "$FIXTURES"

# Largest real mp4s first — skip tiny placeholder files.
CLIPS=()
while IFS= read -r line; do
  CLIPS+=("$line")
done < <(
  find "$ARCHIVE" -maxdepth 1 -type f \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.webm' \) -size +"${MIN_CLIP_BYTES}c" -print0 \
    | xargs -0 stat -f '%z %N' 2>/dev/null \
    | sort -rn \
    | cut -d' ' -f2-
)

if [[ ${#CLIPS[@]} -eq 0 ]]; then
  echo "No video files over ${MIN_CLIP_BYTES} bytes in: $ARCHIVE" >&2
  exit 1
fi

linked=0
clip_names=()
for f in "${CLIPS[@]}"; do
  [[ $linked -ge $CLIP_COUNT ]] && break
  i=$((linked + 1))
  name="clip${i}.mp4"
  ln -sf "$f" "$FIXTURES/$name"
  clip_names+=("\"$name\"")
  size=$(stat -f '%z' "$f" 2>/dev/null || echo 0)
  echo "$name -> $(basename "$f") (${size} bytes)"
  linked=$((linked + 1))
done

if [[ -f "$REDLINE" ]]; then
  AUDIO_NAME="$(basename "$REDLINE")"
  ln -sf "$REDLINE" "$FIXTURES/$AUDIO_NAME"
  echo "$AUDIO_NAME -> $REDLINE"
else
  echo "Redline not found: $REDLINE" >&2
  echo "Set REDLINE= to your test audio file." >&2
  AUDIO_NAME=""
fi

clips_json=$(IFS=,; echo "${clip_names[*]}")
cat > "$FIXTURES/manifest.json" << EOF
{
  "clips": [${clips_json}],
  "audio": "${AUDIO_NAME}",
  "audios": ["${AUDIO_NAME}"]
}
EOF

echo ""
echo "Linked $linked clips from: $ARCHIVE"
echo "QA URL: http://127.0.0.1:5174/?qa=1 (${AUDIO_NAME:-no audio} + ${linked} clips; BPM from Essentia)"
