/**
 * Browser playback acceptance — QA clips, hasReadyFrame, beat phase, screenshots.
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

async function ensureDevServer() {
  try {
    const res = await fetch('http://127.0.0.1:5174/');
    if (res.ok) return null;
  } catch {
    /* not running */
  }
  if (process.env.START_SERVER === '0') {
    throw new Error('Dev server not running on :5174 (start with bun run dev)');
  }
  const server = Bun.spawn(['bun', 'run', 'dev', '--host', '127.0.0.1'], {
    cwd: `${import.meta.dir}/..`,
    stdout: 'pipe',
    stderr: 'pipe'
  });
  await waitForDevServer('http://127.0.0.1:5174/');
  return server;
}

async function readSnapshot(session: CdpSession) {
  return evalPage<Record<string, unknown>>(session, `window.__BSP_QA__?.snapshot?.()`);
}

async function runAcceptance(session: CdpSession) {
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await Bun.write(`${ARTIFACT_DIR}/.keep`, '');
  await session.send('Page.navigate', { url: QA_URL });
  await Bun.sleep(8_000);
  await evalPage(session, `window.__BSP_QA__?.startTransport?.()`);
  await Bun.sleep(500);

  const t0Snap = await readSnapshot(session);
  await Bun.sleep(1_500);
  const snap = await readSnapshot(session);
  if (!snap) throw new Error('Snapshot missing __BSP_QA__');

  const modules0 = (t0Snap?.modules ?? {}) as Record<string, { currentTime?: number }>;
  const modules1 = (snap.modules ?? {}) as Record<string, { currentTime?: number; hasReadyFrame?: boolean }>;
  let videoDelta = 0;
  for (const id of Object.keys(modules1)) {
    const d = (modules1[id]?.currentTime ?? 0) - (modules0[id]?.currentTime ?? 0);
    if (d > videoDelta) videoDelta = d;
  }
  const videoAdvancing = videoDelta > 0.15;

  const beatPhase0 = Number(snap.beatPhase ?? 0);
  await Bun.sleep(600);
  const snap1 = await readSnapshot(session);
  const beatPhase1 = Number(snap1?.beatPhase ?? 0);
  const beatAdvances = beatPhase1 !== beatPhase0 || Boolean(snap1?.playing);

  await screenshotPng(session, `${ARTIFACT_DIR}/playback-full.png`);

  const modules = modules1;
  const readyCount = Object.values(modules).filter((m) => m.hasReadyFrame).length;

  const report = {
    passed: readyCount >= 8 && videoAdvancing,
    url: QA_URL,
    webgpu: snap.webgpu,
    playing: snap.playing,
    clipsLoaded: snap.clipsLoaded,
    readyCount,
    videoAdvancing,
    videoDelta,
    beatPhase0,
    beatPhase1,
    beatAdvances,
    bpm: snap.bpm,
    pgmModule: snap.pgmModule,
    analysisStatus: snap.analysisStatus,
    modules
  };

  await Bun.write(`${ARTIFACT_DIR}/playback-report.json`, JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error(`Playback acceptance failed: ${JSON.stringify(report)}`);
  }

  console.log('verify-playback PASSED', `${readyCount}/8 ready`, `delta=${videoDelta.toFixed(2)}s`);
}

async function main() {
  const server = await ensureDevServer();
  const debugPort = 9333 + Math.floor(Math.random() * 1000);
  const userDataDir = `/tmp/bsp-chrome-${Bun.randomUUIDv7()}`;
  const chromeProc = spawnChrome(debugPort, userDataDir);

  try {
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
