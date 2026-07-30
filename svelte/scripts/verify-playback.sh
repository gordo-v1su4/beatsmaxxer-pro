#!/usr/bin/env bash
# Browser playback gate — QA clips load, video time advances, PNG + JSON artifacts.
set -euo pipefail
export PATH="${HOME}/.bun/bin:${PATH}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p .artifacts

START_SERVER="${START_SERVER:-1}"
export START_SERVER

if [[ "$START_SERVER" != "0" ]]; then
  if ! curl -sf "http://127.0.0.1:5174/" >/dev/null 2>&1; then
    bun run dev --host 127.0.0.1 &
    DEV_PID=$!
    trap 'kill $DEV_PID 2>/dev/null || true' EXIT
    for _ in $(seq 1 40); do
      curl -sf "http://127.0.0.1:5174/" >/dev/null 2>&1 && break
      sleep 0.25
    done
  fi
fi

bun scripts/verify-playback-runner.ts
