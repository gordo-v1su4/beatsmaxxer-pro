import { dispatchUserGesture, evalPage, navigateAndReady, withChrome } from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;

await withChrome('verify-beat', 9950, async (s) => {
  await navigateAndReady(s, QA_URL);
  await evalPage(s, `window.__BSP_QA__?.waitForClips?.(8, 45000)`, 55_000);
  await dispatchUserGesture(s);
  for (let attempt = 0; attempt < 3; attempt++) {
    await evalPage(s, 'window.__BSP_QA__?.startTransport?.()', 25_000);
    const playing = await evalPage<boolean>(s, 'window.__BSP_QA__?.snapshot?.()?.playing', 10_000);
    if (playing) break;
    await dispatchUserGesture(s);
    await Bun.sleep(500);
  }

  const metrics = await evalPage<{
    beatPhase0: number;
    beatPhase1: number;
    beat0: number;
    beat1: number;
    bpm: number;
    playing: boolean;
    advanced: boolean;
  }>(
    s,
    `(async () => {
    const qa = window.__BSP_QA__;
    let a = qa.snapshot();
    const deadline = Date.now() + 4000;
    let b = a;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 250));
      b = qa.snapshot();
      if (
        b.beatPhase !== a.beatPhase ||
        b.beat !== a.beat ||
        (b.playing && b.beatPhase > 0)
      ) {
        break;
      }
    }
    const advanced =
      b.beatPhase !== a.beatPhase ||
      b.beat !== a.beat ||
      (b.playing && b.beatPhase > 0);
    return {
      beatPhase0: a.beatPhase,
      beatPhase1: b.beatPhase,
      beat0: a.beat,
      beat1: b.beat,
      bpm: b.bpm,
      playing: b.playing,
      advanced
    };
  })()`,
    20_000
  );

  const report = {
    passed: Boolean(metrics?.playing) && Boolean(metrics?.advanced) && (metrics?.bpm ?? 0) > 0,
    expectedBpm: 133,
    bpmMatch: metrics?.bpm === 133,
    ...metrics,
    note: 'QA manifest sets BPM 133; Essentia may override after analysis'
  };

  await Bun.write(`${ARTIFACT_DIR}/beat-report.json`, JSON.stringify(report, null, 2));
  s.close();

  if (!report.passed) throw new Error(`Beat gate failed: ${JSON.stringify(report)}`);
  console.log(
    'verify-beat PASSED',
    `bpm=${report.bpm}`,
    `phase ${report.beatPhase0?.toFixed(2)}→${report.beatPhase1?.toFixed(2)}`
  );
});
