/**
 * Stutter gate — sample video.currentTime vs wall clock over 30s play.
 */
import {
  connectCdp,
  evalPage,
  spawnChrome,
  waitForDevServer,
  type CdpSession
} from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;
const START_SERVER = process.env.START_SERVER !== '0';
const SAMPLE_MS = Number(process.env.STUTTER_MS ?? 30_000);

async function runAcceptance(session: CdpSession) {
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Page.navigate', { url: QA_URL });
  await Promise.race([
    session.waitForEvent('Page.loadEventFired', 15_000),
    Bun.sleep(8_000)
  ]);
  await Bun.sleep(8_000);
  await evalPage(session, `window.__BSP_QA__?.startTransport?.()`);
  await Bun.sleep(500);

  const metrics = await evalPage<{
    samples: number;
    seeks: number;
    maxDeltaMs: number;
    p95DeltaMs: number;
  }>(session, `(async () => {
    const qa = window.__BSP_QA__;
    const deadline = Date.now() + ${SAMPLE_MS};
    const deltas = [];
    let seeks = 0;
    let prev = null;
    let prevWall = null;
    while (Date.now() < deadline) {
      const snap = qa.snapshot();
      const mod = snap.modules?.transition || snap.modules?.speedramp;
      const t = mod?.currentTime ?? 0;
      const wall = performance.now();
      if (prev != null) {
        const dt = (t - prev) * 1000;
        const dw = wall - prevWall;
        const delta = Math.abs(dt - dw);
        deltas.push(delta);
        if (delta > 50 && snap.modules?.timesampler?.currentTime === mod?.currentTime) seeks++;
      }
      prev = t;
      prevWall = wall;
      await new Promise(r => setTimeout(r, 100));
    }
    deltas.sort((a,b)=>a-b);
    const p95 = deltas[Math.floor(deltas.length * 0.95)] ?? 0;
    return { samples: deltas.length, seeks, maxDeltaMs: Math.max(...deltas, 0), p95DeltaMs: p95 };
  })()`);

  const report = {
    passed: (metrics?.seeks ?? 99) <= 3 && (metrics?.p95DeltaMs ?? 999) < 120,
    sampleMs: SAMPLE_MS,
    ...metrics
  };

  await Bun.write(`${ARTIFACT_DIR}/stutter-report.json`, JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error(`Stutter gate failed: ${JSON.stringify(report)}`);
  }

  console.log('verify-stutter PASSED', `p95=${report.p95DeltaMs}ms seeks=${report.seeks}`);
}

const server = START_SERVER
  ? Bun.spawn(['bun', 'run', 'dev', '--host', '127.0.0.1'], {
      cwd: `${import.meta.dir}/..`,
      stdout: 'pipe',
      stderr: 'pipe'
    })
  : null;

const debugPort = 9555 + Math.floor(Math.random() * 1000);
const userDataDir = `/tmp/bsp-chrome-stut-${Bun.randomUUIDv7()}`;
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
