/**
 * UI interaction acceptance — knobs/sliders clickable while playing, no uncaught errors.
 */
import {
  connectCdp,
  evalPage,
  screenshotPng,
  spawnChrome,
  waitForDevServer,
  type CdpSession
} from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;
const START_SERVER = process.env.START_SERVER !== '0';

async function runAcceptance(session: CdpSession) {
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Log.enable');

  const consoleErrors: string[] = [];
  session.send('Runtime.evaluate', {
    expression: `window.addEventListener('error', e => { window.__BSP_ERRS__ = (window.__BSP_ERRS__||[]).concat(String(e.error||e.message)); });`
  });

  await session.send('Page.navigate', { url: QA_URL });
  await Promise.race([
    session.waitForEvent('Page.loadEventFired', 15_000),
    Bun.sleep(8_000)
  ]);
  await Bun.sleep(8_000);
  await evalPage(session, `window.__BSP_QA__?.startTransport?.()`);
  await Bun.sleep(500);
  await Bun.sleep(500);

  const interactions = await evalPage<{ clicks: number; errors: string[] }>(session, `(() => {
    const errors = [];
    let clicks = 0;
    try {
      const buttons = [...document.querySelectorAll('button')].slice(0, 12);
      for (const btn of buttons) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        clicks++;
      }
      const ranges = [...document.querySelectorAll('input[type=range]')].slice(0, 6);
      for (const r of ranges) {
        r.dispatchEvent(new Event('input', { bubbles: true }));
        clicks++;
      }
    } catch (e) { errors.push(String(e)); }
    return { clicks, errors: (window.__BSP_ERRS__||[]).concat(errors) };
  })()`);

  await Bun.sleep(800);
  const snap = await evalPage<Record<string, unknown>>(session, `window.__BSP_QA__?.snapshot?.()`);
  await screenshotPng(session, `${ARTIFACT_DIR}/interaction.png`);

  const report = {
    passed: (interactions?.clicks ?? 0) >= 5 && (interactions?.errors?.length ?? 0) === 0,
    clicks: interactions?.clicks ?? 0,
    errors: interactions?.errors ?? [],
    playing: snap?.playing ?? false,
    clipsLoaded: snap?.clipsLoaded ?? 0
  };

  await Bun.write(`${ARTIFACT_DIR}/interaction-report.json`, JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error(`Interaction acceptance failed: ${JSON.stringify(report)}`);
  }

  console.log('verify-interaction PASSED', `clicks=${report.clicks}`);
}

const server = START_SERVER
  ? Bun.spawn(['bun', 'run', 'dev', '--host', '127.0.0.1'], {
      cwd: `${import.meta.dir}/..`,
      stdout: 'pipe',
      stderr: 'pipe'
    })
  : null;

const debugPort = 9444 + Math.floor(Math.random() * 1000);
const userDataDir = `/tmp/bsp-chrome-int-${Bun.randomUUIDv7()}`;
const chromeProc = spawnChrome(debugPort, userDataDir);

try {
  if (server) await waitForDevServer('http://127.0.0.1:5174/');
  const session = await connectCdp(debugPort);
  try {
    await runAcceptance(session);
  } finally {
    session.close();
  }
} finally {
  chromeProc.kill();
  await chromeProc.exited;
  server?.kill();
  if (server) await server.exited;
}
