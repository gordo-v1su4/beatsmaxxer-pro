#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bun scripts/verify-broken-fixtures-runner.ts
