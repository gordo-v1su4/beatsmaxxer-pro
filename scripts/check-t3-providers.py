#!/usr/bin/env python3
"""Print T3 Code provider binary paths for this machine.

Run: uv run python scripts/check-t3-providers.py
"""

from __future__ import annotations

import shutil
from pathlib import Path

PROVIDERS: dict[str, list[str]] = {
    "Cursor": ["cursor-agent"],
    "OpenCode": ["opencode"],
    "Claude": ["claude"],
    "Codex": ["codex"],
    "Grok": ["grok"],
}

KNOWN_FALLBACKS: dict[str, Path] = {
    "cursor-agent": Path.home() / "AppData/Local/cursor-agent/cursor-agent.cmd",
    "opencode": Path.home() / ".bun/bin/opencode.exe",
    "claude": Path.home() / "AppData/Roaming/npm/claude.cmd",
    "codex": Path.home() / "AppData/Roaming/npm/codex.cmd",
    "grok": Path.home() / ".grok/bin/grok.exe",
}


def resolve(name: str) -> Path | None:
    found = shutil.which(name)
    if found:
        return Path(found)
    fallback = KNOWN_FALLBACKS.get(name)
    if fallback and fallback.exists():
        return fallback
    return None


def main() -> None:
    print("T3 Code provider binary paths (paste into Settings -> Providers -> Binary path)\n")
    for provider, names in PROVIDERS.items():
        path = None
        for name in names:
            path = resolve(name)
            if path:
                break
        if path:
            print(f"{provider:10}  {path}")
        else:
            print(f"{provider:10}  NOT FOUND")


if __name__ == "__main__":
    main()
