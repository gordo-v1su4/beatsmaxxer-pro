/** Minimal Chrome DevTools Protocol client for acceptance scripts. */
import { accessSync, constants, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CDP_TIMEOUT_MS = Number(process.env.CDP_TIMEOUT_MS ?? 20_000);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

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
    '/opt/pw-browsers/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
      : undefined
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
  private eventListeners = new Map<string, Array<(params: unknown) => void>>();

  constructor(private ws: WebSocket) {
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
      };
      if (!message.id) {
        const event = message as unknown as { method?: string; params?: unknown };
        if (event.method) for (const listener of this.eventListeners.get(event.method) ?? []) listener(event.params);
        return;
      }
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

  on(method: string, listener: (params: unknown) => void) {
    const listeners = this.eventListeners.get(method) ?? [];
    listeners.push(listener);
    this.eventListeners.set(method, listeners);
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
  timeoutMs = DEFAULT_CDP_TIMEOUT_MS,
  label = expression.replace(/\s+/g, ' ').trim().slice(0, 160)
): Promise<T | null> {
  try {
    const result = (await session.send(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: true
      },
      timeoutMs
    )) as {
      result?: { value?: T; description?: string };
      exceptionDetails?: {
        text?: string;
        exception?: { description?: string; value?: unknown };
      };
    };
    if (result.exceptionDetails) {
      const exception = result.exceptionDetails.exception;
      const detail = exception?.description
        ?? (exception?.value === undefined ? undefined : String(exception.value))
        ?? result.exceptionDetails.text
        ?? 'Runtime.evaluate threw an unknown exception';
      throw new Error(detail);
    }
    return result.result?.value ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`CDP evaluation "${label || '<empty expression>'}" failed: ${message}`);
  }
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

export function chromeLaunchArgs(
  chrome: string,
  debugPort: number,
  userDataDir: string,
  headed = process.env.HEADLESS !== '1',
  allowAutoplayBypass = process.env.QA_AUTOPLAY_BYPASS === '1'
) {
  return [
    chrome,
    ...(headed ? [] : [
      '--headless=new',
      '--enable-unsafe-swiftshader',
      '--enable-unsafe-webgpu',
      '--use-angle=swiftshader',
      '--use-gl=angle'
    ]),
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-extensions',
    '--no-first-run',
    // Browser.getBrowserCommandLine intentionally refuses provenance unless
    // Chrome was launched as an automation session. This does not make the
    // browser headless or select a GPU backend.
    '--enable-automation',
    ...(allowAutoplayBypass ? ['--autoplay-policy=no-user-gesture-required'] : []),
    // default window was 774x441, which cropped every module preview out of the
    // screenshot artifact — a "proof" PNG that could not show a rendered frame
    '--window-size=1680,1050',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ];
}

/** Click a visible labeled button through CDP input so browser gesture policy is genuinely exercised. */
export async function dispatchVisibleButtonClick(session: CdpSession, label: string) {
  const rect = await evalPage<{ x: number; y: number }>(session, `(() => {
    const target = ${JSON.stringify(label.trim().toUpperCase())};
    const button = [...document.querySelectorAll('button')].find((candidate) => {
      const text = (candidate.textContent || '').replace(/\\s+/g, ' ').trim().toUpperCase();
      const bounds = candidate.getBoundingClientRect();
      return text === target && !candidate.disabled && bounds.width > 0 && bounds.height > 0;
    });
    if (!button) return null;
    const bounds = button.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  })()`, 10_000, `locate visible ${label} button`);
  if (!rect) throw new Error(`Visible ${label} button is unavailable`);
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1
  });
}

export function spawnChrome(
  debugPort: number,
  userDataDir: string,
  headed = process.env.HEADLESS !== '1'
) {
  const chrome = chromePath();
  const args = chromeLaunchArgs(chrome, debugPort, userDataDir, headed);
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
  readyExpr = 'document.documentElement.dataset.bmxQa === "1"',
  timeoutMs = 30_000
) {
  const startedAt = Date.now();
  console.log(`[cdp] navigating to ${url}`);
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
  let stalledProbes = 0;
  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    try {
      const ready = await evalPage<boolean>(
        session,
        readyExpr,
        Math.min(8_000, Math.max(1, remainingMs)),
        'page readiness marker'
      );
      if (ready) {
        console.log(`[cdp] page ready after ${Date.now() - startedAt}ms (${stalledProbes} stalled probe(s))`);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('CDP timeout: Runtime.evaluate')) throw error;
      stalledProbes++;
      console.log(
        `[cdp] readiness probe ${stalledProbes} stalled while the page main thread was busy; ` +
        `${Math.max(0, deadline - Date.now())}ms remain`
      );
    }
    await Bun.sleep(250);
  }
  throw new Error(
    `Timed out waiting for page ready: ${url} ` +
    `(overall ${timeoutMs}ms deadline; ${stalledProbes} stalled readiness probe(s))`
  );
}

export async function withChrome<T>(
  label: string,
  portBase: number,
  fn: (session: CdpSession) => Promise<T>
): Promise<T> {
  const port = pickDebugPort(portBase);
  const profilesRoot = browserProfilesRoot();
  mkdirSync(profilesRoot, { recursive: true });
  const userDataDir = resolve(profilesRoot, `${label}-${Date.now()}-${port}`);
  console.log(`[${label}] Chrome debug port ${port}`);
  console.log(`[${label}] Chrome profile ${userDataDir}`);
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

export function browserProfilesRoot() {
  // Vite watches the svelte/ project root. Chrome writes hundreds of profile
  // files while a proof is running, so profiles must live at the repository
  // artifact root rather than under svelte/.artifacts.
  return resolve(REPO_ROOT, '.artifacts/browser-profiles');
}

export function cleanupStaleTestChrome() {
  // Exact spawned PIDs are terminated by withChrome; broad process killing is forbidden.
}
