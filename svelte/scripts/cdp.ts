/** Minimal Chrome DevTools Protocol client for acceptance scripts. */

export function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      if (Bun.file(candidate).size >= 0) return candidate;
    } catch {
      /* try next */
    }
  }
  throw new Error('No Chrome/Chromium binary found');
}

export class CdpSession {
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
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
      this.pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(message.error.message ?? 'CDP error'));
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
        this.ws.removeEventListener('message', handler);
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      const handler = (event: MessageEvent) => {
        const message = JSON.parse(String(event.data)) as { method?: string };
        if (message.method === method) {
          clearTimeout(timer);
          this.ws.removeEventListener('message', handler);
          resolve();
        }
      };
      this.ws.addEventListener('message', handler);
    });
  }
}

export async function connectCdp(debugPort: number, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const targets = (await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) =>
        r.json()
      )) as Array<{ webSocketDebuggerUrl?: string }>;
      const target = targets.find((t) => t.webSocketDebuggerUrl) ?? targets[0];
      if (target?.webSocketDebuggerUrl) {
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise<void>((resolve, reject) => {
          ws.addEventListener('open', () => resolve());
          ws.addEventListener('error', () => reject(new Error('CDP websocket failed')));
        });
        return new CdpSession(ws);
      }
    } catch {
      /* Chrome may still be booting */
    }
    await Bun.sleep(100);
  }
  throw new Error('Timed out connecting to Chrome CDP');
}

export async function waitForDevServer(url: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* still starting */
    }
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for dev server at ${url}`);
}

export async function evalPage<T>(session: CdpSession, expression: string): Promise<T | null> {
  const result = (await session.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })) as { result?: { value?: T } };
  return result.result?.value ?? null;
}

export async function screenshotPng(session: CdpSession, path: string) {
  const result = (await session.send('Page.captureScreenshot', {
    format: 'png'
  })) as { data?: string };
  if (!result.data) throw new Error('Screenshot failed');
  await Bun.write(path, Buffer.from(result.data, 'base64'));
}

export function spawnChrome(debugPort: number, userDataDir: string) {
  const chrome = chromePath();
  return Bun.spawn(
    [
      chrome,
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--enable-unsafe-webgpu',
      '--use-angle=swiftshader',
      '--use-gl=angle',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank'
    ],
    { stdout: 'ignore', stderr: 'pipe' }
  );
}
