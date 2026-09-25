#!/usr/bin/env bash
# CI-safe #25 QA autoload: ARM sequencer via URL (no Redline test_media bundle).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/lib/common.sh
source "$ROOT/scripts/lib/common.sh"

trap cleanup_dev_server EXIT

ensure_artifacts_dir
cleanup_stale_test_chrome
bash "$ROOT/scripts/ensure-cloud-qa-media.sh"
ensure_dev_server

export HEADLESS=1
# common.sh sets QA_URL without qaSequencerArm — override for this gate.
export QA_URL="http://127.0.0.1:5174/?qa=1&qaAutoplay=1&qaSequencerArm=1"
export QA_SMOKE_SEQUENCER_ONLY=1

echo "▶ sequencer ARM CDP smoke"
bun run scripts/verify-cloud-smoke-runner.ts
echo "▶ sequencer ARMED cut CDP gate"
bun run scripts/verify-sequencer-cut-runner.ts
echo "▶ sequencer ARMED loop region CDP gate"
export QA_URL="http://127.0.0.1:5174/?qa=1&qaAutoplay=1&qaSequencerArm=1&qaLoopRegion=1"
bun run scripts/verify-sequencer-loop-runner.ts
echo "▶ trigger mark commit CDP gate"
export QA_URL="http://127.0.0.1:5174/?qa=1&qaAutoplay=1"
bun run scripts/verify-trigger-commit-runner.ts
echo "▶ arrangement REC clip/trigger CDP gate"
bun run scripts/verify-arrangement-rec-runner.ts
echo "ci-sequencer-arm-smoke PASSED"
