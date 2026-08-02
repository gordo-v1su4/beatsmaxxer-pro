#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"
TAILSCALED_PID=""
APP_PGID=""
TAILSCALE_SOCKET="/tmp/tailscaled-beat-surfer.sock"
TAILSCALE_STATE="/tmp/tailscaled-beat-surfer.state"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
  if [[ -n "$APP_PGID" ]] && kill -0 -- "-$APP_PGID" 2>/dev/null; then
    kill -TERM -- "-$APP_PGID" 2>/dev/null || true
    for _ in $(seq 1 10); do
      kill -0 -- "-$APP_PGID" 2>/dev/null || break
      sleep 0.2
    done
    kill -KILL -- "-$APP_PGID" 2>/dev/null || true
  fi
  if [[ -n "$TAILSCALED_PID" ]] && sudo kill -0 "$TAILSCALED_PID" 2>/dev/null; then
    sudo kill "$TAILSCALED_PID" 2>/dev/null || true
  fi
  sudo rm -f "$TAILSCALE_SOCKET" "$TAILSCALE_STATE" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 143' INT TERM

start_tailscale() {
  if [[ -z "${TS_AUTHKEY:-}" ]]; then
    echo "[cloud-agent] TS_AUTHKEY is not set; Tailnet services (e.g. desktop Essentia) will be unavailable." >&2
    return 0
  fi

  local tailscaled_bin
  local tailscale_bin
  tailscaled_bin="$(command -v tailscaled)" || {
    echo "[cloud-agent] tailscaled is not installed." >&2
    exit 1
  }
  tailscale_bin="$(command -v tailscale)" || {
    echo "[cloud-agent] tailscale is not installed." >&2
    exit 1
  }

  sudo rm -f "$TAILSCALE_SOCKET"
  sudo "$tailscaled_bin" \
    --state="$TAILSCALE_STATE" \
    --socket="$TAILSCALE_SOCKET" \
    --tun=userspace-networking \
    --outbound-http-proxy-listen=localhost:1054 \
    --socks5-server=localhost:1055 &
  TAILSCALED_PID=$!

  for _ in $(seq 1 30); do
    [[ -S "$TAILSCALE_SOCKET" ]] && break
    sleep 1
  done
  [[ -S "$TAILSCALE_SOCKET" ]] || {
    echo "[cloud-agent] tailscaled control socket did not become ready." >&2
    exit 1
  }

  sudo "$tailscale_bin" --socket="$TAILSCALE_SOCKET" up \
    --auth-key="$TS_AUTHKEY" \
    --hostname=beat-surfer-pro \
    --accept-dns=true
  unset TS_AUTHKEY

  export ALL_PROXY="socks5h://localhost:1055/"
  export HTTP_PROXY="http://localhost:1054/"
  export HTTPS_PROXY="http://localhost:1054/"
  export NO_PROXY="localhost,127.0.0.1"
  echo "[cloud-agent] Tailscale userspace networking is ready."
}

start_app() {
  local status=0
  cd "$REPO_ROOT"
  bun install --frozen-lockfile
  echo "[cloud-agent] Starting Beat Surfer Pro dev server on 0.0.0.0:5174."
  echo "[cloud-agent] WebGPU renders in the browser on your GPU desktop — open this port from Chrome on a Tailnet machine with a GPU." >&2
  setsid env DEV_HOST=0.0.0.0 bun run dev -- --host 0.0.0.0 &
  APP_PGID=$!
  wait "$APP_PGID" || status=$?
  cleanup
  APP_PGID=""
  return "$status"
}

start_tailscale
start_app
