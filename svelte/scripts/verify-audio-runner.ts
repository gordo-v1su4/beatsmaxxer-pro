import { evalPage, navigateAndReady, withChrome } from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;

await withChrome('verify-audio', 9900, async (s) => {
  await navigateAndReady(s, QA_URL);
  await evalPage(s, `window.__BSP_QA__?.waitForClips?.(8, 45000)`, 55_000);
  // Essentia analysis + SoundTouch init run during QA boot — no transport required.
  await Bun.sleep(6000);

  const snap = await evalPage<{
    playing?: boolean;
    analysisStatus?: string;
    soundTouchActive?: boolean;
    bpm?: number;
    clipsLoaded?: number;
  }>(s, 'window.__BSP_QA__?.snapshot?.()', 15_000);

  const analysisOk =
    snap?.analysisStatus === 'ready' ||
    snap?.analysisStatus === 'fallback' ||
    snap?.analysisStatus === 'analyzing';

  const report = {
    passed: Boolean(snap?.soundTouchActive) && analysisOk && (snap?.clipsLoaded ?? 0) >= 8,
    playing: snap?.playing,
    analysisStatus: snap?.analysisStatus,
    soundTouchActive: snap?.soundTouchActive,
    bpm: snap?.bpm,
    clipsLoaded: snap?.clipsLoaded,
    note: 'Does not prove audible output — run manual listen test with your mp3'
  };

  await Bun.write(`${ARTIFACT_DIR}/audio-report.json`, JSON.stringify(report, null, 2));
  s.close();

  if (!report.passed) throw new Error(`Audio gate failed: ${JSON.stringify(report)}`);
  console.log(
    'verify-audio PASSED',
    `soundTouch=${report.soundTouchActive}`,
    `rhy=${report.analysisStatus}`,
    `bpm=${report.bpm}`
  );
});
