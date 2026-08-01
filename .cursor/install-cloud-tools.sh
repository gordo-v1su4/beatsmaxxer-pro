#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.bun/bin:$PATH"

install_bun() {
  if command -v bun >/dev/null 2>&1; then
    echo "[cloud-install] bun $(bun --version)"
    return 0
  fi
  echo "[cloud-install] installing bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  bun --version
}

install_chrome() {
  if command -v google-chrome >/dev/null 2>&1; then return 0; fi
  if command -v chromium-browser >/dev/null 2>&1; then return 0; fi
  if command -v chromium >/dev/null 2>&1; then return 0; fi
  if [[ "$(uname -s)" == "Linux" ]] && command -v apt-get >/dev/null 2>&1; then
    echo "[cloud-install] installing chromium for headless smoke gates..."
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq chromium-browser curl ca-certificates
  fi
}

install_bun
install_chrome

echo "[cloud-install] svelte dependencies"
cd "$(dirname "$0")/../svelte"
bun install

echo "[cloud-install] done"
