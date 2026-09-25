#!/usr/bin/env bash
# Validate an existing headed capture on a GPU machine (report.json + verify:visual-proof).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="${REPO_ROOT}/svelte/.artifacts/visual-proof/report.json"

if [[ ! -f "$REPORT" ]]; then
  echo "Missing visual proof report: $REPORT" >&2
  echo "Run verify:issue25-gpu (headed) on a GPU desktop first." >&2
  exit 1
fi

cd "${REPO_ROOT}/svelte"
bun run verify:visual-proof
echo "issue #25 GPU report validation PASSED"
