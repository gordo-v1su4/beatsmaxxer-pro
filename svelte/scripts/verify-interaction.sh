#!/usr/bin/env bash
set -euo pipefail
export PATH="${HOME}/.bun/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p .artifacts

if ! curl -sf "http://127.0.0.1:5174/" >/dev/null 2>&1; then
  echo "Dev server required on :5174" >&2
  exit 1
fi

bun scripts/verify-interaction-runner.ts
