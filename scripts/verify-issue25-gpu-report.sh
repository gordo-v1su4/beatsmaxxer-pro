#!/usr/bin/env bash
# Validate an existing headed capture on a GPU machine (report.json + verify:visual-proof).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_REPORT="${REPO_ROOT}/svelte/.artifacts/visual-proof/report.json"
REPORT="${BMX_VISUAL_PROOF_REPORT:-${VISUAL_PROOF_REPORT:-$DEFAULT_REPORT}}"
if [[ "$REPORT" != /* ]]; then
  REPORT="${REPO_ROOT}/${REPORT#./}"
fi

if [[ ! -f "$REPORT" ]]; then
  echo "Missing visual proof report: $REPORT" >&2
  echo "Run verify:issue25-gpu (headed) on a GPU desktop first, or set BMX_VISUAL_PROOF_REPORT / VISUAL_PROOF_REPORT to a copied report.json." >&2
  exit 1
fi

cd "${REPO_ROOT}/svelte"
export VISUAL_PROOF_REPORT="$REPORT"
bun run verify:visual-proof
echo "issue #25 GPU report validation PASSED"
