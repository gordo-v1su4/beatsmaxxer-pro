#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/lib/common.sh"
trap cleanup_production_preview EXIT

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
command -v ffprobe >/dev/null || { echo 'ffprobe is required to verify real-media metadata.' >&2; exit 1; }
bun scripts/verify-redline-proof-media.ts
ensure_artifacts_dir
printf '%s\n' '[visual-proof] creating source-bound production build'
bun run build
cleanup_stale_test_chrome
ensure_production_preview
export QA_URL PROOF_SERVER_ORIGIN ARTIFACT_DIR

bun scripts/capture-visual-proof-runner.ts
bun scripts/verify-visual-proof-runner.ts
