#!/usr/bin/env bash
# Summarize a detached or tee'd verify:issue25-gpu log (default: /tmp/bmx-issue25-gpu-latest.log).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${1:-/tmp/bmx-issue25-gpu-latest.log}"
REPORT="${REPO_ROOT}/svelte/.artifacts/visual-proof/report.json"

if [[ ! -f "$LOG" ]]; then
  echo "Log not found: $LOG" >&2
  exit 2
fi

echo "=== log: $LOG ==="
if grep -q 'issue #25 GPU acceptance PASSED' "$LOG"; then
  echo "RESULT: PASS (verify:issue25-gpu)"
  grep 'EXIT:' "$LOG" | tail -1 || true
  if [[ -f "$REPORT" ]]; then
    echo "report: $REPORT"
  else
    echo "WARN: log claims pass but $REPORT is missing" >&2
    exit 1
  fi
  exit 0
fi

if grep -q 'SKIP_VISUAL_PROOF=1' "$LOG"; then
  echo "RESULT: cloud-only (visual proof skipped — not full GPU acceptance)" >&2
  exit 1
fi

echo "RESULT: FAIL or incomplete"
grep -E 'ci-sequencer-arm-smoke PASSED|capture:visual-proof|verify-visual-proof|Headed visual proof|Redline ../test_media|Physical-browser visual proof' "$LOG" | tail -12 || true
grep -E '^error:|^▶ issue #25' "$LOG" | tail -10 || true
grep 'EXIT:' "$LOG" | tail -1 || echo "EXIT: (not recorded yet — run may still be in progress)"
exit 1
