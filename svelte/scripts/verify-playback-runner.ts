import { type CdpSession, evalPage, navigateAndReady, screenshotPng, withChrome } from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;
const CLIP_WAIT_MS = Number(process.env.CLIP_WAIT_MS ?? 45_000);

async function waitForClips(session: CdpSession) {
  const snap = await evalPage(
    session,
    `window.__BSP_QA__?.waitForClips?.(8, ${CLIP_WAIT_MS})`,
    CLIP_WAIT_MS + 10_000
  );
  // NB: `undefined < 8` is false, so a missing/!resolved snapshot must be
  // rejected explicitly or the gate sails past an unloaded rack.
  const loaded = (snap as { clipsLoaded?: number } | null)?.clipsLoaded;
  if (typeof loaded !== 'number' || loaded < 8) {
    throw new Error(
      `Timed out waiting for 8 ready clips (${CLIP_WAIT_MS}ms); got ${String(loaded)}`
    );
  }
  return snap as { clipsLoaded: number; modules?: Record<string, { hasReadyFrame?: boolean }> };
}

await withChrome('verify-playback', 9600, async (s) => {
  await navigateAndReady(s, QA_URL);
  await waitForClips(s);

  await evalPage(
    s,
    `window.__BSP_QA__?.prepareEightVideoBenchmark?.(${Math.min(CLIP_WAIT_MS, 30_000)})`,
    CLIP_WAIT_MS + 10_000
  ).catch(() => evalPage(s, 'window.__BSP_QA__?.snapshot?.()', 15_000));

  await Bun.sleep(500);
  await waitForClips(s);

  const t0 = await evalPage<{ modules?: Record<string, { currentTime?: number }> }>(
    s,
    'window.__BSP_QA__?.snapshot?.()',
    15_000
  );
  await Bun.sleep(1500);
  const t1 = await evalPage<{
    clipsLoaded?: number;
    webgpu?: boolean;
    bpm?: number;
    modules?: Record<string, { currentTime?: number; hasReadyFrame?: boolean }>;
  }>(s, 'window.__BSP_QA__?.snapshot?.()', 15_000);

  let videoDelta = 0;
  for (const k of Object.keys(t1?.modules ?? {})) {
    const d = (t1!.modules![k]!.currentTime ?? 0) - (t0?.modules?.[k]?.currentTime ?? 0);
    if (d > videoDelta) videoDelta = d;
  }

  const readyCount = Object.values(t1?.modules ?? {}).filter((m) => m.hasReadyFrame).length;

  if (process.env.SCREENSHOT === '1') {
    await screenshotPng(s, `${ARTIFACT_DIR}/playback-full.png`);
  }

  const report = {
    passed: readyCount >= 8 && videoDelta > 0.15,
    clipsLoaded: t1?.clipsLoaded,
    readyCount,
    videoDelta,
    webgpu: t1?.webgpu,
    bpm: t1?.bpm,
    modules: t1?.modules
  };

  await Bun.write(`${ARTIFACT_DIR}/playback-report.json`, JSON.stringify(report, null, 2));
  s.close();

  if (!report.passed) {
    throw new Error(`Playback acceptance failed: ${JSON.stringify(report)}`);
  }
  console.log('verify-playback PASSED', `${readyCount}/8`, `delta=${videoDelta.toFixed(2)}s`);
});
