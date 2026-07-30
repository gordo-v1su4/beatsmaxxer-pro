#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/lib/common.sh"
trap cleanup_dev_server EXIT
cleanup_stale_test_chrome
ensure_qa_media
ensure_artifacts_dir
ensure_dev_server
export QA_URL ARTIFACT_DIR
bun scripts/verify-playback-runner.ts
