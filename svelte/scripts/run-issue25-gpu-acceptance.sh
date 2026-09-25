#!/usr/bin/env bash
# Issue #25 desktop acceptance: cloud-safe CDP gates + headed visual proof (GPU machine).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/lib/common.sh
source "$ROOT/scripts/lib/common.sh"

trap cleanup_dev_server EXIT

echo "▶ issue #25 — unit tests"
cd "$ROOT/.."
bun run test

cd "$ROOT"
bash "$ROOT/scripts/ensure-cloud-qa-media.sh"
ensure_artifacts_dir
cleanup_stale_test_chrome
ensure_dev_server

export HEADLESS=1
echo "▶ issue #25 — sequencer ARM / cut / loop CDP gates"
bash "$ROOT/scripts/ci-sequencer-arm-smoke.sh"

if [[ "${SKIP_VISUAL_PROOF:-0}" == "1" ]]; then
  echo "SKIP_VISUAL_PROOF=1 — skipping headed capture:visual-proof"
  exit 0
fi

if [[ "${PHYSICAL_BROWSER_OBSERVED:-0}" != "1" || -z "${PHYSICAL_BROWSER_OPERATOR:-}" ]]; then
  echo "Headed visual proof skipped: set PHYSICAL_BROWSER_OBSERVED=1 and PHYSICAL_BROWSER_OPERATOR=<name>." >&2
  echo "Re-run with those env vars on a GPU desktop (5090/M3) after bash scripts/setup-qa-media.sh." >&2
  exit 0
fi

if [[ -d "$ROOT/../test_media" ]]; then
  echo "▶ validating Redline test_media bundle"
  bash "$ROOT/scripts/setup-qa-media.sh"
else
  echo "WARN: ../test_media missing — visual proof may fail without Redline assets." >&2
fi

export PHYSICAL_BROWSER_LAG_OBSERVED="${PHYSICAL_BROWSER_LAG_OBSERVED:-0}"
echo "▶ issue #25 — capture:visual-proof + verify:visual-proof"
bun run capture:visual-proof

echo "issue #25 GPU acceptance PASSED"
