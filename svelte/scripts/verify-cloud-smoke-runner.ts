import { type CdpSession, evalPage, navigateAndReady, withChrome } from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1';
const CLIP_WAIT_MS = Number(process.env.CLIP_WAIT_MS ?? 45_000);

await withChrome('verify-cloud-smoke', 9601, async (session) => {
  await navigateAndReady(session, QA_URL);

  const loaded = await evalPage(
    session,
    `window.__BMX_QA__?.waitForClips?.(8, ${CLIP_WAIT_MS})`,
    CLIP_WAIT_MS + 10_000
  );
  const clipsLoaded = (loaded as { clipsLoaded?: number } | null)?.clipsLoaded;
  if (typeof clipsLoaded !== 'number' || clipsLoaded < 8) {
    throw new Error(`Cloud smoke: expected 8 clips, got ${String(clipsLoaded)}`);
  }

  await evalPage(
    session,
    `window.__BMX_QA__?.prepareEightVideoBenchmark?.(${Math.min(CLIP_WAIT_MS, 30_000)})`,
    CLIP_WAIT_MS + 10_000
  ).catch(async () => {
    await evalPage(session, 'window.__BMX_QA__?.snapshot?.()', 15_000);
  });

  await Bun.sleep(2000);

  const snap = (await evalPage(session, 'window.__BMX_QA__?.snapshot?.()', 15_000)) as {
    clipsLoaded?: number;
    playing?: boolean;
    modules?: Record<string, { currentTime?: number }>;
  } | null;

  let maxDelta = 0;
  const t0 = snap?.modules ?? {};
  await Bun.sleep(1500);
  const t1 = ((await evalPage(session, 'window.__BMX_QA__?.snapshot?.()', 15_000)) as typeof snap)
    ?.modules ?? {};
  for (const key of Object.keys(t1)) {
    const delta = (t1[key]?.currentTime ?? 0) - (t0[key]?.currentTime ?? 0);
    if (delta > maxDelta) maxDelta = delta;
  }

  const report = {
    passed: (snap?.clipsLoaded ?? 0) >= 8,
    clipsLoaded: snap?.clipsLoaded,
    playing: snap?.playing,
    maxVideoDelta: maxDelta,
    webgpu: (snap as { webgpu?: boolean } | null)?.webgpu ?? false
  };

  session.close();

  if (!report.passed) {
    throw new Error(`Cloud smoke snapshot failed: ${JSON.stringify(report)}`);
  }
  console.log('cloud-smoke snapshot OK', JSON.stringify(report));
});
