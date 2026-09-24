#!/usr/bin/env bash
# Run the full browser gate suite in tmux so self-hosted / long cloud-worker
# sessions survive Cursor disconnects. Logs remain on disk for later inspection.
#
# Usage (repo root):
#   HEADLESS=1 bash scripts/run-test-local-detached.sh
#   tail -f /tmp/bmx-test-local-latest.log
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION_NAME="${BMX_TEST_LOCAL_SESSION:-bmx-test-local}"
LOG_PATH="${BMX_TEST_LOCAL_LOG:-/tmp/bmx-test-local-latest.log}"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required for detached test:local" >&2
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

export HEADLESS="${HEADLESS:-1}"
CMD="cd ${REPO_ROOT} && unset TEST_MEDIA_ROOT BMX_TEST_MEDIA_ROOT && HEADLESS=${HEADLESS} bun run test:local 2>&1 | tee ${LOG_PATH}; echo EXIT:\\$? | tee -a ${LOG_PATH}"

"${TMUX[@]}" new-session -d -s "${SESSION_NAME}" -c "${REPO_ROOT}" -- "${SHELL:-bash}" -lc "${CMD}"

echo "Started test:local in tmux session '${SESSION_NAME}' (HEADLESS=${HEADLESS})."
echo "  attach: ${TMUX[*]} attach -t ${SESSION_NAME}"
echo "  log:    tail -f ${LOG_PATH}"
