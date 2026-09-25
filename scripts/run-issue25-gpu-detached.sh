#!/usr/bin/env bash
# Run issue #25 GPU acceptance in tmux (headed visual proof can take 30+ minutes).
#
# Usage (repo root, GPU desktop with ../test_media):
#   PHYSICAL_BROWSER_OBSERVED=1 PHYSICAL_BROWSER_OPERATOR=<you> PHYSICAL_BROWSER_LAG_OBSERVED=0 \
#     bash scripts/run-issue25-gpu-detached.sh
#   tail -f /tmp/bmx-issue25-gpu-latest.log
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION_NAME="${BMX_ISSUE25_GPU_SESSION:-bmx-issue25-gpu}"
LOG_PATH="${BMX_ISSUE25_GPU_LOG:-/tmp/bmx-issue25-gpu-latest.log}"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required for detached verify:issue25-gpu" >&2
  exit 1
fi

TMUX=(tmux)
if [[ -f /exec-daemon/tmux.portal.conf ]]; then
  TMUX=(tmux -f /exec-daemon/tmux.portal.conf)
fi

if "${TMUX[@]}" has-session -t "=${SESSION_NAME}" 2>/dev/null; then
  echo "tmux session '${SESSION_NAME}' already exists."
  echo "  attach: ${TMUX[*]} attach -t ${SESSION_NAME}"
  echo "  log:    tail -f ${LOG_PATH}"
  exit 0
fi

CMD="cd ${REPO_ROOT} && { bun run verify:issue25-gpu; echo EXIT:\$?; } 2>&1 | tee ${LOG_PATH}"

"${TMUX[@]}" new-session -d -s "${SESSION_NAME}" -c "${REPO_ROOT}" -- "${SHELL:-bash}" -lc "${CMD}"

echo "Started verify:issue25-gpu in tmux session '${SESSION_NAME}'."
echo "  attach: ${TMUX[*]} attach -t ${SESSION_NAME}"
echo "  log:    tail -f ${LOG_PATH}"
