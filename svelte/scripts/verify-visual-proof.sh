#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# This script verifies evidence captured in a physical headed browser. It does
# not synthesize proof or downgrade the requirement when the report is absent.
bun scripts/verify-visual-proof-runner.ts
