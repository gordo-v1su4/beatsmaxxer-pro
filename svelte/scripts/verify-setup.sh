#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/lib/common.sh"
require_chrome
ensure_qa_media
echo "[verify:setup] OK — Chrome found, QA media ready"
