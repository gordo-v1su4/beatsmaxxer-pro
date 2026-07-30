import { evalPage, navigateAndReady, withChrome } from './cdp.ts';

const MS = Number(process.env.STUTTER_MS ?? 8000);
const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;

await withChrome('verify-stutter', 9800, async (s) => {
  await navigateAndReady(s, QA_URL);
  await Bun.sleep(5000);
  // Free-run modules advance without transport.

  const metrics = await evalPage<{
    samples: number;
    seeks: number;
    p95DeltaMs: number;
    maxDeltaMs: number;
  }>(
    s,
    `(async () => {
    const qa = window.__BSP_QA__;
    const deadline = Date.now() + ${MS};
    const deltas = [];
    let seeks = 0;
    let prev = null, prevWall = null;
    while (Date.now() < deadline) {
      const snap = qa.snapshot();
      const mod = snap.modules?.orbit || snap.modules?.punch;
      const t = mod?.currentTime ?? 0;
      const wall = performance.now();
      if (prev != null) {
        const delta = Math.abs((t - prev) * 1000 - (wall - prevWall));
        if (delta < 500) deltas.push(delta);
        if (delta > 50 && delta < 500) seeks++;
      }
      prev = t; prevWall = wall;
      await new Promise(r => setTimeout(r, 100));
    }
    deltas.sort((a,b)=>a-b);
    return { samples: deltas.length, seeks, p95DeltaMs: deltas[Math.floor(deltas.length * 0.95)] ?? 0, maxDeltaMs: Math.max(...deltas, 0) };
  })()`,
    MS + 15_000
  );

  const report = {
    passed: (metrics?.seeks ?? 99) <= 12 && (metrics?.p95DeltaMs ?? 999) < 150,
    sampleMs: MS,
    ...metrics
  };

  await Bun.write(`${ARTIFACT_DIR}/stutter-report.json`, JSON.stringify(report, null, 2));
  s.close();

  if (!report.passed) throw new Error(`Stutter gate failed: ${JSON.stringify(report)}`);
  console.log('verify-stutter PASSED p95=' + report.p95DeltaMs + 'ms');
});
