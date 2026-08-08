# Beatsmaxxer Pro — GPU sandbox image for the app-vm deployment.
#
# Mirrors the Cursor Cloud environment (`.cursor/environment.json`) as a
# permanent Docker sandbox on the Tailnet GPU VM:
#   - Bun pinned to the same version as `.cursor/install-cloud-tools.sh`
#   - Google Chrome + Xvfb so the browser gates (`bun run test:local`,
#     `bun run verify:browser`) render WebGPU on the host NVIDIA GPU
#     (headed-under-Xvfb path; the HEADLESS=1 path forces SwiftShader)
#
# The compose file mounts the repo worktree at /app, so installs and edits
# behave like a normal dev checkout.

FROM oven/bun:1.3.10-debian

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg unzip coreutils util-linux xvfb \
      fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
      libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
      libvulkan1 libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 \
      libxkbcommon0 libxrandr2 mesa-vulkan-drivers xdg-utils \
 && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
      > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install against the mounted worktree, then serve Vite on all interfaces.
CMD ["bash", "-lc", "bun install --frozen-lockfile && bun run dev -- --host 0.0.0.0"]
