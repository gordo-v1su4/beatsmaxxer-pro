/**
 * Verifies core UI controls remain clickable while QA media is loaded.
 */
const QA_URL =
  "http://127.0.0.1:5174/?qa=test-media&qaAutoplay=0&qaPgm=timesampler";

const server = Bun.spawn(["bun", "run", "dev", "--host", "127.0.0.1"], {
  stdout: "pipe",
  stderr: "pipe",
  env: {
    ...process.env,
    ESSENTIA_API_KEY: "",
    QA_MEDIA_DIR: `${process.cwd()}/tests/fixtures/media`,
  },
});

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      const stderr = await new Response(server.stderr).text();
      throw new Error(stderr.trim() || `Vite exited with ${server.exitCode}`);
    }
    try {
      const response = await fetch("http://127.0.0.1:5174/");
      if (response.ok) return;
    } catch {
      // still starting
    }
    await Bun.sleep(100);
  }
  throw new Error("Timed out waiting for Vite");
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      if (Bun.file(candidate).size >= 0) return candidate;
    } catch {
      // try next
    }
  }
  throw new Error("No Chrome/Chromium binary found");
}

class CdpSession {
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(private ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
      };
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(message.error.message ?? "CDP error"));
      } else {
        entry.resolve(message.result);
      }
    });
  }

  send(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }

  waitForEvent(method: string, timeoutMs = 8_000) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ws.removeEventListener("message", handler);
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      const handler = (event: MessageEvent) => {
        const message = JSON.parse(String(event.data)) as {
          method?: string;
        };
        if (message.method === method) {
          clearTimeout(timer);
          this.ws.removeEventListener("message", handler);
          resolve();
        }
      };
      this.ws.addEventListener("message", handler);
    });
  }
}

async function connectCdp(debugPort: number) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const targets = (await fetch(
        `http://127.0.0.1:${debugPort}/json/list`,
      ).then((response) => response.json())) as Array<{
        webSocketDebuggerUrl?: string;
      }>;
      const target =
        targets.find((entry) => entry.webSocketDebuggerUrl) ?? targets[0];
      if (target?.webSocketDebuggerUrl) {
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise<void>((resolve, reject) => {
          ws.addEventListener("open", () => resolve());
          ws.addEventListener("error", () =>
            reject(new Error("CDP websocket failed")),
          );
        });
        return new CdpSession(ws);
      }
    } catch {
      // Chrome may still be booting.
    }
    await Bun.sleep(100);
  }
  throw new Error("Timed out connecting to Chrome CDP");
}

async function runUiTest() {
  const chrome = chromePath();
  const debugPort = 9666 + Math.floor(Math.random() * 1000);
  const userDataDir = `/tmp/beat-surfer-ui-${Bun.randomUUIDv7()}`;
  const chromeProc = Bun.spawn(
    [
      chrome,
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
      "--use-gl=angle",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdout: "ignore", stderr: "pipe" },
  );

  let session: CdpSession | null = null;
  try {
    session = await connectCdp(debugPort);
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await session.send("DOM.enable");
    const navigation = session.send("Page.navigate", { url: QA_URL });
    await Promise.race([
      session.waitForEvent("Page.loadEventFired"),
      navigation,
    ]);
    await Bun.sleep(4_000);

    const beforeClick = (await session.send("Runtime.evaluate", {
      expression: `(() => ({
        playLabel: [...document.querySelectorAll('button')].find((button) =>
          /^(PLAY|STOP)$/.test((button.textContent || '').trim())
        )?.textContent?.trim() ?? null,
        buttons: document.querySelectorAll('button').length,
      }))()`,
      returnByValue: true,
    })) as { result?: { value?: { playLabel?: string | null; buttons?: number } } };
    const initial = beforeClick.result?.value;
    if (!initial?.buttons || initial.buttons < 5) {
      throw new Error(`Expected interactive buttons, found ${initial?.buttons ?? 0}`);
    }
    if (initial.playLabel !== "PLAY") {
      throw new Error(`Expected PLAY button before click, got ${initial.playLabel ?? "none"}`);
    }

    const clickResult = (await session.send("Runtime.evaluate", {
      expression: `(() => {
        const playButton = [...document.querySelectorAll('button')].find((button) =>
          (button.textContent || '').trim() === 'PLAY'
        );
        if (!playButton) return { ok: false, reason: 'play-button-missing' };
        playButton.click();
        return { ok: true };
      })()`,
      returnByValue: true,
    })) as { result?: { value?: { ok?: boolean; reason?: string } } };
    if (!clickResult.result?.value?.ok) {
      throw new Error(
        `Failed to click PLAY: ${clickResult.result?.value?.reason ?? "unknown"}`,
      );
    }

    await Bun.sleep(500);

    const afterClick = (await session.send("Runtime.evaluate", {
      expression: `(() => ({
        playLabel: [...document.querySelectorAll('button')].find((button) =>
          /^(PLAY|STOP)$/.test((button.textContent || '').trim())
        )?.textContent?.trim() ?? null,
        dataset: document.documentElement.dataset.beatSurferMultiClip ?? null,
      }))()`,
      returnByValue: true,
    })) as {
      result?: {
        value?: { playLabel?: string | null; dataset?: string | null };
      };
    };
    const final = afterClick.result?.value;
    if (final?.playLabel !== "STOP" && final?.playLabel !== "PLAY") {
      throw new Error(`Unexpected transport button after click: ${final?.playLabel ?? "none"}`);
    }

    const pgmClick = (await session.send("Runtime.evaluate", {
      expression: `(() => {
        const buttons = [...document.querySelectorAll('button')];
        const transition = buttons.find((button) =>
          (button.textContent || '').includes('TRANS')
        );
        if (!transition) return { ok: false, reason: 'pgm-button-missing' };
        transition.click();
        return { ok: true };
      })()`,
      returnByValue: true,
    })) as { result?: { value?: { ok?: boolean; reason?: string } } };
    if (!pgmClick.result?.value?.ok) {
      throw new Error(
        `Failed to click PGM channel button: ${pgmClick.result?.value?.reason ?? "unknown"}`,
      );
    }

    console.log(
      "UI interaction acceptance passed:",
      `buttons=${initial.buttons}`,
      `transport=${final?.playLabel}`,
      `telemetry=${final?.dataset ? "present" : "absent"}`,
    );
  } finally {
    session?.close();
    chromeProc.kill();
    await chromeProc.exited;
  }
}

try {
  await waitForServer();
  await runUiTest();
} finally {
  server.kill();
  await server.exited;
}
