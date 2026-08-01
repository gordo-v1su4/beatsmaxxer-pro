#!/usr/bin/env bash
# Cloud-safe smoke gate — run before claiming the dev server is working.
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/lib/common.sh
source "$ROOT/scripts/lib/common.sh"

trap cleanup_dev_server EXIT

echo "══════════════════════════════════════════"
echo " Beat Surfer Pro — cloud smoke gate"
echo "══════════════════════════════════════════"

ensure_qa_media
ensure_dev_server

echo ""
echo "▶ vitest"
bun run test

echo ""
echo "▶ production build"
bun run build

echo ""
echo "▶ HTTP probe"
curl -sf "$DEV_URL" >/dev/null
curl -sf "${QA_URL}" >/dev/null

echo ""
echo "▶ QA snapshot (8 clips, no WebGPU requirement)"
HEADLESS=1 bun run scripts/verify-cloud-smoke-runner.ts

echo ""
echo "verify-cloud-smoke PASSED"
