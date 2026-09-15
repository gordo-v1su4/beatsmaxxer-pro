#!/usr/bin/env bash
# Shallow-clone WebGPU peer repos into research/webgpu-peers/repos/
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_DIR="$ROOT/repos"
REFRESH="${1:-}"

mkdir -p "$REPOS_DIR"

clone_or_refresh() {
  local name="$1"
  local url="$2"
  local dest="$REPOS_DIR/$name"

  if [[ -d "$dest/.git" ]]; then
    if [[ "$REFRESH" == "--refresh" ]]; then
      echo "Refreshing $name ..."
      git -C "$dest" fetch --depth 1 origin
      git -C "$dest" reset --hard origin/HEAD
    else
      echo "Skip $name (exists). Pass --refresh to update."
    fi
    return
  fi

  echo "Cloning $name ..."
  git clone --depth 1 "$url" "$dest"
}

clone_or_refresh beatform           "https://github.com/0langa/beatform.git"
clone_or_refresh ghost-arcade       "https://github.com/riskcapital/ghost-arcade.git"
clone_or_refresh freecut            "https://github.com/walterlow/freecut.git"
clone_or_refresh webgpu-video-rendering "https://github.com/apssouza22/webgpu-video-rendering.git"
clone_or_refresh webgpu-samples     "https://github.com/webgpu/webgpu-samples.git"
clone_or_refresh spektral           "https://github.com/kaltwrk/spektral.git"
clone_or_refresh webgpu-video-shaders "https://github.com/kbrandwijk/webgpu-video-shaders.git"

echo "Done. Clones live in $REPOS_DIR (gitignored)."
