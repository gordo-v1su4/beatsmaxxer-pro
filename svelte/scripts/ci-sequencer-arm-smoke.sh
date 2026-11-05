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

run_cdp_gate() {
  local label="$1"
  local runner="$2"
  local max_attempts="${CDP_INFRA_MAX_ATTEMPTS:-3}"
  if [[ ! "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
    echo "[ci] invalid CDP_INFRA_MAX_ATTEMPTS='$max_attempts'; falling back to 3" >&2
    max_attempts=3
  fi
  local attempt=1
  local status=0
  local log_file

  log_file="$(mktemp "${TMPDIR:-/tmp}/bmx-cdp-gate.XXXXXX")"
  while (( attempt <= max_attempts )); do
    echo "▶ ${label} (attempt ${attempt}/${max_attempts})"
    set +e
    bun run "$runner" 2>&1 | tee "$log_file"
    status=${PIPESTATUS[0]}
    set -e

    if (( status == 0 )); then
      rm -f "$log_file"
      return 0
    fi

    if (( attempt == max_attempts )) || ! grep -Eq \
      'A valid external Instance reference no longer exists|Internal Vulkan error|Exiting GPU process due to errors during initialization' \
      "$log_file"; then
      rm -f "$log_file"
      return "$status"
    fi

    echo "[ci] Chromium/WebGPU infrastructure failed; retrying ${label} with a clean browser process"
    cleanup_stale_test_chrome
    : > "$log_file"
    attempt=$((attempt + 1))
  done
}

run_cdp_gate "sequencer ARM CDP smoke" scripts/verify-cloud-smoke-runner.ts
run_cdp_gate "sequencer ARMED cut CDP gate" scripts/verify-sequencer-cut-runner.ts
export QA_URL="http://127.0.0.1:5174/?qa=1&qaAutoplay=1&qaSequencerArm=1&qaLoopRegion=1"
run_cdp_gate "sequencer ARMED loop region CDP gate" scripts/verify-sequencer-loop-runner.ts
export QA_URL="http://127.0.0.1:5174/?qa=1&qaAutoplay=1"
run_cdp_gate "trigger mark commit CDP gate" scripts/verify-trigger-commit-runner.ts
run_cdp_gate "arrangement REC clip/trigger CDP gate" scripts/verify-arrangement-rec-runner.ts
echo "ci-sequencer-arm-smoke PASSED"
