/** Minimal Chrome DevTools Protocol client for acceptance scripts. */
import { accessSync, constants } from 'node:fs';

const DEFAULT_CDP_TIMEOUT_MS = Number(process.env.CDP_TIMEOUT_MS ?? 20_000);

function isExecutable(path: string) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    // CI/cloud agent images ship Chromium here via PLAYWRIGHT_BROWSERS_PATH
    process.env.PLAYWRIGHT_BROWSERS_PATH
      ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
      : undefined,
    '/opt/pw-browsers/chromium'
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate;
  }
  throw new Error('No Chrome/Chromium binary found. Install Chrome or set CHROME_PATH.');
}

export class CdpSession {
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(private ws: WebSocket) {
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
      };
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(message.error.message ?? 'CDP error'));
      } else {
        entry.resolve(message.result);
      }
    });
    ws.addEventListener('close', () => {
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('CDP websocket closed'));
      }
      this.pending.clear();
    });
  }

  send(method: string, params: Record<string, unknown> = {}, timeoutMs = DEFAULT_CDP_TIMEOUT_MS) {
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

export async function connectCdp(debugPort: number, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`, {
        signal: AbortSignal.timeout(2_000)
      });
      const targets = (await res.json()) as Array<{
        type?: string;
        webSocketDebuggerUrl?: string;
      }>;
      const target =
        targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) ??
        targets.find((t) => t.webSocketDebuggerUrl) ??
        targets[0];
      if (target?.webSocketDebuggerUrl) {
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('CDP websocket open timeout')), 5_000);
          ws.addEventListener('open', () => {
            clearTimeout(timer);
            resolve();
          });
          ws.addEventListener('error', () => {
            clearTimeout(timer);
            reject(new Error('CDP websocket failed'));
          });
        });
        return new CdpSession(ws);
      }
    } catch {
      /* Chrome may still be booting */
    }
    await Bun.sleep(150);
  }
  throw new Error(`Timed out connecting to Chrome CDP on port ${debugPort}`);
}

export async function waitForDevServer(url: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
    } catch {
      /* still starting */
    }
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for dev server at ${url}`);
}

export async function evalPage<T>(
  session: CdpSession,
  expression: string,
  timeoutMs = DEFAULT_CDP_TIMEOUT_MS
): Promise<T | null> {
  const result = (await session.send(
    'Runtime.evaluate',
    {
      expression,
      returnByValue: true,
      awaitPromise: true
    },
    timeoutMs
  )) as { result?: { value?: T; description?: string } };
  return result.result?.value ?? null;
}

export async function screenshotPng(session: CdpSession, path: string) {
  const result = (await session.send('Page.captureScreenshot', {
    format: 'png'
  })) as { data?: string };
  if (!result.data) throw new Error('Screenshot failed');
  await Bun.write(path, Buffer.from(result.data, 'base64'));
}

export function pickDebugPort(base = 9600, span = 400) {
  return base + Math.floor(Math.random() * span);
}

export function spawnChrome(
  debugPort: number,
  userDataDir: string,
  headed = process.env.HEADLESS !== '1'
) {
  const chrome = chromePath();
  const args = [
    chrome,
    ...(headed ? [] : ['--headless=new']),
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--enable-unsafe-webgpu',
    '--use-angle=swiftshader',
    '--use-gl=angle',
    // Without this the QA autoload's audioEngine.start() is blocked for lack of
    // a user gesture; the clip load then unwinds and the rack falls back to a
    // partially loaded state (observed: 8 clips ready, then down to 2).
    '--autoplay-policy=no-user-gesture-required',
    // default window was 774x441, which cropped every module preview out of the
    // screenshot artifact — a "proof" PNG that could not show a rendered frame
    '--window-size=1680,1050',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ];
  return Bun.spawn(args, { stdout: 'ignore', stderr: 'pipe' });
}

export async function dispatchUserGesture(session: CdpSession) {
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 120,
    y: 120,
    button: 'left',
    clickCount: 1
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 120,
    y: 120,
    button: 'left',
    clickCount: 1
  });
}

export async function navigateAndReady(
  session: CdpSession,
  url: string,
  readyExpr = 'document.documentElement.dataset.bspQa === "1"',
  timeoutMs = 30_000
) {
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  // --window-size is ignored under --headless=new, so screenshots came back at
  // 774x441 with every module preview cropped out. Override device metrics so
  // the artifact actually contains the rack.
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: Number(process.env.QA_VIEWPORT_W ?? 1680),
    height: Number(process.env.QA_VIEWPORT_H ?? 1050),
    deviceScaleFactor: 1,
    mobile: false
  });
  await session.send('Page.navigate', { url }, 30_000);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await evalPage<boolean>(session, readyExpr, 8_000);
    if (ready) return;
    await Bun.sleep(250);
  }
  throw new Error(`Timed out waiting for page ready: ${url}`);
}

export async function withChrome<T>(
  label: string,
  portBase: number,
  fn: (session: CdpSession) => Promise<T>
): Promise<T> {
  const port = pickDebugPort(portBase);
  const userDataDir = `/tmp/bsp-${label}-${Date.now()}-${port}`;
  console.log(`[${label}] Chrome debug port ${port}`);
  const proc = spawnChrome(port, userDataDir);
  try {
    await Bun.sleep(500);
    const session = await connectCdp(port);
    return await fn(session);
  } finally {
    proc.kill(9);
    try {
      await proc.exited;
    } catch {
      /* ignore */
    }
  }
}

export function cleanupStaleTestChrome() {
  try {
    Bun.spawnSync(['pkill', '-9', '-f', 'user-data-dir=/tmp/bsp-'], { stdout: 'ignore', stderr: 'ignore' });
  } catch {
    /* no stale processes */
  }
}
