/**
 * End-to-end workflow: test_media manifest, Essentia proxy, app load, playback telemetry.
 */
import path from "path";

const ROOT = process.cwd();
const QA_URL =
  "http://127.0.0.1:5174/?qa=test-media&qaAutoplay=1&qaPgm=timesampler";

const server = Bun.spawn(["bun", "run", "dev", "--host", "127.0.0.1"], {
  stdout: "pipe",
  stderr: "pipe",
  cwd: ROOT,
  env: {
    ...process.env,
    QA_MEDIA_DIR: path.join(ROOT, "test_media"),
  },
});

type StepResult = { step: string; ok: boolean; detail: string };

const results: StepResult[] = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
}

async function waitForServer() {
  const deadline = Date.now() + 25_000;
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
    await Bun.sleep(150);
  }
  throw new Error("Timed out waiting for Vite");
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      if (Bun.file(candidate).size >= 0) return candidate;
    } catch {
      // try next
    }
  }
  throw new Error("Chrome not found");
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
      if (message.error) entry.reject(new Error(message.error.message ?? "CDP error"));
      else entry.resolve(message.result);
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

  waitForEvent(method: string, timeoutMs = 15_000) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ws.removeEventListener("message", handler);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const handler = (event: MessageEvent) => {
        const message = JSON.parse(String(event.data)) as { method?: string };
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
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      const targets = (await fetch(
        `http://127.0.0.1:${debugPort}/json/list`,
      ).then((r) => r.json())) as Array<{ webSocketDebuggerUrl?: string }>;
      const target = targets.find((t) => t.webSocketDebuggerUrl);
      if (target?.webSocketDebuggerUrl) {
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise<void>((resolve, reject) => {
          ws.addEventListener("open", () => resolve());
          ws.addEventListener("error", () => reject(new Error("CDP websocket failed")));
        });
        return new CdpSession(ws);
      }
    } catch {
      // retry
    }
    await Bun.sleep(120);
  }
  throw new Error("CDP connect timeout");
}

async function evaluate<T>(session: CdpSession, expression: string) {
  const result = (await session.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })) as { result?: { value?: T } };
  return result.result?.value;
}

async function main() {
  let session: CdpSession | null = null;
  let chromeProc: ReturnType<typeof Bun.spawn> | null = null;

  try {
    // 1. Manifest
    await waitForServer();
    const manifest = (await fetch("http://127.0.0.1:5174/__qa/media/manifest.json").then(
      (r) => r.json(),
    )) as { clips?: string[]; audio?: string | null };
    record(
      "qa_manifest",
      (manifest.clips?.length ?? 0) >= 1 && !!manifest.audio,
      `${manifest.clips?.length ?? 0} clips, audio=${manifest.audio ?? "none"}`,
    );

    // 2. Essentia proxy (do not log key or response body secrets)
    const wavName = manifest.audio ?? "Love me tonight x Love me tonight (Remastered x2) (Mashup).wav";
    const wavBytes = await Bun.file(path.join(ROOT, "test_media", wavName)).arrayBuffer();
    const fd = new FormData();
    fd.set("file", new File([wavBytes], "test.wav", { type: "audio/wav" }));
    const analyzeRes = await fetch("http://127.0.0.1:5174/__api/analyze/fast", {
      method: "POST",
      body: fd,
    });
    let analyzeBpm: number | null = null;
    if (analyzeRes.ok) {
      const payload = (await analyzeRes.json()) as { bpm?: number };
      analyzeBpm = payload.bpm ?? null;
    }
    record(
      "essentia_proxy",
      analyzeRes.ok && analyzeBpm !== null && analyzeBpm > 0,
      analyzeRes.ok
        ? `status=${analyzeRes.status} bpm=${analyzeBpm}`
        : `status=${analyzeRes.status} (fallback BPM will use realtime estimator)`,
    );

    // 3. Headless browser workflow
    const chrome = chromePath();
    const debugPort = 9444 + Math.floor(Math.random() * 200);
    const userDataDir = path.join(ROOT, ".tmp", `chrome-e2e-${Date.now()}`);
    await Bun.write(path.join(userDataDir, ".keep"), "");
    chromeProc = Bun.spawn(
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

    session = await connectCdp(debugPort);
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    const nav = session.send("Page.navigate", { url: QA_URL });
    await Promise.race([session.waitForEvent("Page.loadEventFired"), nav]);
    await Bun.sleep(4_000);

    // 4. Clips registered + canvases
    const boot = await evaluate<{
      canvases: number;
      hasSong: boolean;
      bpmText: string;
    }>(session, `({
      canvases: document.querySelectorAll('canvas').length,
      hasSong: document.body.innerText.includes('Love me tonight'),
      bpmText: (() => {
        const m = document.body.innerText.match(/(\\d{2,3})\\s*BPM/i);
        return m ? m[0] : '';
      })(),
    })`);

    record(
      "app_boot",
      (boot?.canvases ?? 0) >= 8 && !!boot?.hasSong,
      `canvases=${boot?.canvases} song=${boot?.hasSong ? "loaded" : "missing"} bpm_ui=${boot?.bpmText}`,
    );

    // 5. Click PLAY if needed
    await evaluate(session, `
      (() => {
        const btn = [...document.querySelectorAll('button')].find(b => /^(PLAY|STOP)$/i.test(b.textContent?.trim() ?? ''));
        if (btn && btn.textContent?.trim() === 'PLAY') btn.click();
      })()
    `);
    await Bun.sleep(8_000);

    // 6. Telemetry after playback (poll PGM until frames present or timeout)
    const telemetryDeadline = Date.now() + 25_000;
    let telemetry: {
      multiClip: Record<string, unknown> | null;
      qa: Record<string, unknown> | null;
      bpm: number;
      analysisStatus: string;
      playing: boolean;
      previewBadges: number;
    } | null = null;

    while (Date.now() < telemetryDeadline) {
      telemetry = await evaluate<typeof telemetry>(session, `(function() {
        const text = document.body.innerText;
        const bpmMatch = text.match(/(\\d{2,3})\\s*BPM[·\\s]/i);
        const analysisStatus =
          text.includes('RHY·ON') ? 'ready'
          : text.includes('RHY·RT') ? 'fallback'
          : text.includes('RHY·ERR') ? 'error'
          : text.includes('RHY·...') ? 'analyzing'
          : 'off';
        return {
          multiClip: (() => {
            try {
              const raw = document.documentElement.dataset.beatSurferMultiClip;
              return raw ? JSON.parse(raw) : null;
            } catch { return null; }
          })(),
          qa: (() => {
            try {
              const raw = document.documentElement.dataset.beatSurferQaTelemetry;
              return raw ? JSON.parse(raw) : null;
            } catch { return null; }
          })(),
          bpm: bpmMatch ? parseInt(bpmMatch[1], 10) : 0,
          analysisStatus,
          playing: text.includes('STOP'),
          previewBadges: [...document.querySelectorAll('*')].filter(el => el.textContent?.includes('FX PREVIEW')).length,
        };
      })()`);
      const presented =
        (telemetry?.multiClip as { performance?: { frames?: { presented?: number } } } | null)
          ?.performance?.frames?.presented ?? 0;
      const path =
        (telemetry?.multiClip as { renderer?: { fallback?: { path?: string } } } | null)?.renderer
          ?.fallback?.path ?? "unknown";
      if (presented > 0 && path !== "native-static") break;
      await Bun.sleep(400);
    }

    const fallbackPath =
      (telemetry?.multiClip as { renderer?: { fallback?: { path?: string } } } | null)?.renderer
        ?.fallback?.path ?? "unknown";
    const dropRatio =
      (telemetry?.multiClip as { performance?: { frames?: { lateOrDroppedRatio?: number | null } } } | null)
        ?.performance?.frames?.lateOrDroppedRatio ?? null;
    const presented =
      (telemetry?.multiClip as { performance?: { frames?: { presented?: number } } } | null)?.performance
        ?.frames?.presented ?? 0;

    record(
      "pgm_renderer",
      fallbackPath !== "native-static" && presented > 0,
      `path=${fallbackPath} presented=${presented} drops=${dropRatio ?? "n/a"}`,
    );
    record(
      "fx_previews",
      (telemetry?.previewBadges ?? 0) >= 8,
      `preview_badges=${telemetry?.previewBadges}`,
    );
    record(
      "bpm_transport",
      (telemetry?.bpm ?? 0) >= 60 &&
        (telemetry?.bpm ?? 0) <= 200 &&
        !!telemetry?.playing,
      `bpm=${telemetry?.bpm} analysis=${telemetry?.analysisStatus} playing=${telemetry?.playing}`,
    );

    // 7. Switch PGM channel
    await evaluate(session, `
      (() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('1 TRANSITION'));
        btn?.click();
      })()
    `);
    await Bun.sleep(2_000);
    const afterSwitch = await evaluate<{ pgm: string | null }>(session, `({
      pgm: (() => {
        try {
          const raw = document.documentElement.dataset.beatSurferMultiClip;
          const j = raw ? JSON.parse(raw) : null;
          return j?.roles?.pgm ?? null;
        } catch { return null; }
      })(),
    })`);
    record("pgm_switch", afterSwitch?.pgm === "transition", `pgm=${afterSwitch?.pgm}`);

    const failed = results.filter((r) => !r.ok);
    console.log("\n=== E2E SUMMARY ===");
    console.log(`Passed ${results.length - failed.length}/${results.length}`);
    if (failed.length) {
      console.log("Failures:");
      for (const f of failed) console.log(`  - ${f.step}: ${f.detail}`);
      process.exitCode = 1;
    }
  } finally {
    session?.close();
    chromeProc?.kill();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  server.kill();
  process.exit(1);
});
