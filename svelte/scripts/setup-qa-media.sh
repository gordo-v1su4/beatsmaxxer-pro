#!/usr/bin/env bash
# Validate the authoritative real-media bundle without copying, linking, or
# modifying it. The /qa-media route maps the manifest's virtual `redline/`
# prefix to the repo-owned test_media directory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"
bun scripts/validate-redline-media.ts

echo ""
echo "QA media is ready from ../test_media"
echo "Dev URL: http://localhost:5174/?qa=1"
