#!/usr/bin/env bash
# Full local test suite — run from svelte/ or via `bun run test:local`.
#
# Usage:
#   bun run test:local              # unit + build + browser gates (visible Chrome)
#   SKIP_BUILD=1 bun run test:local # browser gates only
#   HEADLESS=1 bun run test:local   # force headless (CI / no display)
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/lib/common.sh
source "$ROOT/scripts/lib/common.sh"

trap cleanup_dev_server EXIT

echo "══════════════════════════════════════════"
echo " Beatsmaxxer Pro — local test suite"
echo "══════════════════════════════════════════"

require_chrome
ensure_qa_media
ensure_artifacts_dir
cleanup_stale_test_chrome
ensure_dev_server

if [[ "${SKIP_UNIT:-0}" != "1" ]]; then
  echo ""
  echo "▶ vitest (unit)"
  bun run test
fi

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo ""
  echo "▶ production build"
  bun run build
fi

# Visible Chrome by default for local runs; set HEADLESS=1 for CI.
export HEADLESS="${HEADLESS:-0}"
if [[ "$HEADLESS" == "1" ]]; then
  echo "[local] browser gates: headless"
else
  echo "[local] browser gates: headed (set HEADLESS=1 to hide Chrome)"
fi

# Optional PNG screenshots from CDP captures
export SCREENSHOT="${SCREENSHOT:-0}"

run_gate() {
  local name="$1"
  shift
  echo ""
  echo "▶ $name"
  "$@"
}

run_gate "verify:ui" bun scripts/verify-ui-runner.ts
run_gate "verify:playback" bun scripts/verify-playback-runner.ts
run_gate "verify:interaction" bun scripts/verify-interaction-runner.ts
run_gate "verify:stutter" env STUTTER_MS="${STUTTER_MS:-8000}" bun scripts/verify-stutter-runner.ts
run_gate "verify:audio" bun scripts/verify-audio-runner.ts
run_gate "verify:beat" bun scripts/verify-beat-runner.ts
run_gate "verify:visual-proof (required release gate)" bun scripts/verify-visual-proof-runner.ts

echo ""
echo "══════════════════════════════════════════"
echo " ✓ All local and physical-browser visual-proof gates passed"
echo " Artifacts: $ARTIFACT_DIR/"
echo "══════════════════════════════════════════"
echo ""
echo "Additional manual checklist (still required before ship):"
echo "  • Upload clips via CLIP / drag-drop / top-bar bulk — eyeball every preview"
echo "  • Upload mp3 — listen for playback + RHY·OK"
echo "  • SoundTouch: TMP without chipmunk, KEY/PIT pitch shift by ear"
echo "  • 60s session: knobs, drag modules, swap clips — no freeze"
echo "  • Screen recording for PR"
echo ""
echo "Interactive QA (no headless):"
echo "  open \"$QA_URL\""
echo ""
echo "  SCREENSHOT=1 bun run test:local   # include PNG captures in .artifacts/"
