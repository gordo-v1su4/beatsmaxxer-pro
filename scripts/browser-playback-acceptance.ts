/**
 * Headless Chrome acceptance: Gems QA media loads and PGM renderer leaves native-static.
 */
const QA_URL =
  "http://127.0.0.1:5174/?qa=gems&qaAutoplay=1&qaPgm=timesampler";

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
  throw new Error("No Chrome/Chromium binary found for headless acceptance");
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

async function readPlaybackSnapshot(session: CdpSession) {
  const result = (await session.send("Runtime.evaluate", {
    expression: `(() => {
      try {
        const raw = document.documentElement.dataset.beatSurferMultiClip;
        const playing = window.__BEAT_SURFER_MULTI_CLIP_QA__?.snapshot?.()?.transport?.playing;
        return {
          snapshot: raw ? JSON.parse(raw) : null,
          hasQaApi: !!window.__BEAT_SURFER_MULTI_CLIP_QA__,
          playing: playing ?? null,
          title: document.title,
        };
      } catch (error) {
        return { error: String(error) };
      }
    })()`,
    returnByValue: true,
    awaitPromise: false,
  })) as {
    result?: {
      value?: {
        snapshot?: Record<string, unknown> | null;
        hasQaApi?: boolean;
        playing?: boolean | null;
        error?: string;
      } | null;
    };
  };
  return result.result?.value ?? null;
}

async function runHeadless() {
  const chrome = chromePath();
  const debugPort = 9333 + Math.floor(Math.random() * 1000);
  const userDataDir = `/tmp/beat-surfer-chrome-${Bun.randomUUIDv7()}`;
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
    await session.send("Log.enable");
    const navigation = session.send("Page.navigate", { url: QA_URL });
    await Promise.race([
      session.waitForEvent("Page.loadEventFired"),
      navigation,
    ]);
    // Allow React effects + async renderer init to settle.
    await Bun.sleep(3_000);

    const deadline = Date.now() + 25_000;
    let snapshot: Record<string, unknown> | null = null;
    let lastError: string | null = null;
    let debugLine = "";

    while (Date.now() < deadline) {
      await Bun.sleep(400);
      const probe = await readPlaybackSnapshot(session);
      if (!probe) continue;
      if (probe.error) {
        lastError = probe.error;
        continue;
      }
      debugLine = JSON.stringify({
        hasQaApi: probe.hasQaApi,
        playing: probe.playing,
      });
      snapshot = probe.snapshot ?? null;
      if (!snapshot) continue;
      if (snapshot.error) {
        lastError = String(snapshot.error);
        continue;
      }
      const roles = snapshot.roles as { pgm?: string | null } | undefined;
      const renderer = snapshot.renderer as
        | { fallback?: { path?: string } }
        | undefined;
      const path = renderer?.fallback?.path;
      if (roles?.pgm && path && path !== "native-static") {
        break;
      }
    }

    if (!snapshot) {
      throw new Error(
        lastError
          ? `Playback snapshot missing; last error: ${lastError}; debug=${debugLine}`
          : `Playback snapshot never appeared; debug=${debugLine}`,
      );
    }

    const roles = snapshot.roles as { pgm?: string | null };
    const renderer = snapshot.renderer as {
      fallback?: { path?: string; reason?: string };
    };
    const path = renderer?.fallback?.path ?? "unknown";

    if (!roles?.pgm) {
      throw new Error(
        `PGM role not assigned: ${JSON.stringify(snapshot)}`,
      );
    }
    if (path === "native-static") {
      throw new Error(
        `Renderer stuck on native-static: ${JSON.stringify(renderer?.fallback)}`,
      );
    }

    console.log(
      "Playback acceptance passed:",
      `pgm=${roles.pgm}`,
      `path=${path}`,
      `reason=${renderer?.fallback?.reason ?? "n/a"}`,
    );
  } finally {
    session?.close();
    chromeProc.kill();
    await chromeProc.exited;
  }
}

try {
  await waitForServer();
  await runHeadless();
} finally {
  server.kill();
  await server.exited;
}
