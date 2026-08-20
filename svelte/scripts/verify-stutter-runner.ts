import { dispatchUserGesture, type CdpSession, evalPage, navigateAndReady, withChrome } from './cdp.ts';

const MS = Number(process.env.STUTTER_MS ?? 8000);
const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;

async function ensureTransportPlaying(session: CdpSession) {
  await dispatchUserGesture(session);
  for (let attempt = 0; attempt < 3; attempt++) {
    await dispatchUserGesture(session);
    await evalPage(session, `window.__BMX_QA__?.startTransport?.()`, 25_000);
    const playing = await evalPage<boolean>(session, 'window.__BMX_QA__?.snapshot?.()?.playing', 10_000);
    if (playing) break;
    await Bun.sleep(500);
  }
  await evalPage(session, `window.__BMX_QA__?.waitForPlaying?.(15000)`, 20_000);
}

await withChrome('verify-stutter', 9800, async (s) => {
  console.log('[verify-stutter] loading QA page');
  await navigateAndReady(s, QA_URL);
  await evalPage(s, `window.__BMX_QA__?.waitForClips?.(8, 45000)`, 55_000);
  console.log('[verify-stutter] starting transport');
  await ensureTransportPlaying(s);
  console.log(`[verify-stutter] sampling ${MS}ms of free-run playback`);

  const metrics = await evalPage<{
    samples: number;
    seeks: number;
    p95DeltaMs: number;
    maxDeltaMs: number;
    meanVideoAdvanceMs: number;
  }>(
    s,
    `(async () => {
    const qa = window.__BMX_QA__;
    const deadline = Date.now() + ${MS};
    const mismatches = [];
    const videoAdvances = [];
    let seeks = 0;
    let prev = null, prevWall = null;
    while (Date.now() < deadline) {
      const snap = qa.snapshot();
      const mod = snap.modules?.orbit || snap.modules?.punch;
      const t = mod?.currentTime ?? 0;
      const rate = mod?.playbackRate ?? 1;
      const wall = performance.now();
      if (prev != null) {
        const videoAdvanceMs = (t - prev) * 1000;
        const wallAdvanceMs = wall - prevWall;
        const expectedAdvanceMs = wallAdvanceMs * rate;
        const mismatch = Math.abs(videoAdvanceMs - expectedAdvanceMs);
        if (videoAdvanceMs > 0 && wallAdvanceMs > 0) {
          mismatches.push(mismatch);
          videoAdvances.push(videoAdvanceMs);
        }
        if (videoAdvanceMs < -20 || videoAdvanceMs - expectedAdvanceMs > 200) seeks++;
      }
      prev = t; prevWall = wall;
      await new Promise(r => setTimeout(r, 500));
    }
    mismatches.sort((a,b)=>a-b);
    const meanVideoAdvanceMs = videoAdvances.length
      ? videoAdvances.reduce((a, b) => a + b, 0) / videoAdvances.length
      : 0;
    return {
      samples: mismatches.length,
      seeks,
      p95DeltaMs: mismatches[Math.floor(mismatches.length * 0.95)] ?? 0,
      maxDeltaMs: Math.max(...mismatches, 0),
      meanVideoAdvanceMs
    };
  })()`,
    MS + 15_000
  );

  const report = {
    passed:
      (metrics?.seeks ?? 99) <= 12 &&
      (metrics?.meanVideoAdvanceMs ?? 0) > 40 &&
      (metrics?.samples ?? 0) >= 3,
    sampleMs: MS,
    ...metrics
  };

  await Bun.write(`${ARTIFACT_DIR}/stutter-report.json`, JSON.stringify(report, null, 2));
  s.close();

  if (!report.passed) throw new Error(`Stutter gate failed: ${JSON.stringify(report)}`);
  console.log(
    'verify-stutter PASSED p95=' +
      report.p95DeltaMs +
      'ms seeks=' +
      report.seeks +
      ' meanAdvance=' +
      report.meanVideoAdvanceMs?.toFixed(1) +
      'ms'
  );
});
