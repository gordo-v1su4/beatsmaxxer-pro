#!/usr/bin/env bash
# Summarize a detached or tee'd test:local log (default: /tmp/bmx-test-local-latest.log).
set -euo pipefail

LOG="${1:-/tmp/bmx-test-local-latest.log}"

if [[ ! -f "$LOG" ]]; then
  echo "Log not found: $LOG" >&2
  exit 2
fi

echo "=== log: $LOG ==="
if grep -q 'All local and required current physical-browser proof gates passed' "$LOG"; then
  echo "RESULT: PASS (full test:local)"
  grep 'EXIT:' "$LOG" | tail -1 || true
  exit 0
fi
if grep -q 'Headless browser gates passed' "$LOG"; then
  echo "RESULT: PASS (headless test:local — physical visual proof skipped)"
  grep 'EXIT:' "$LOG" | tail -1 || true
  exit 0
fi

echo "RESULT: FAIL or incomplete"
grep -E 'verify-(playback|ui|audio|beat|stutter|interaction) (PASSED|FAILED)|verify-playback PASSED|Playback acceptance failed|Timed out waiting' "$LOG" | tail -15 || true
grep -E '^error:|^▶ verify:' "$LOG" | tail -10 || true
grep 'EXIT:' "$LOG" | tail -1 || echo "EXIT: (not recorded yet — run may still be in progress)"
exit 1
