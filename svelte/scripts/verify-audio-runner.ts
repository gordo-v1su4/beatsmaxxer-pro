import { dispatchUserGesture, evalPage, navigateAndReady, withChrome } from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;

await withChrome('verify-audio', 9900, async (s) => {
  await navigateAndReady(s, QA_URL);

  await evalPage(s, `window.__BSP_QA__?.waitForClips?.(8, 45000)`, 55_000);

  await dispatchUserGesture(s);
  for (let attempt = 0; attempt < 3; attempt++) {
    await dispatchUserGesture(s);
    await evalPage(s, `window.__BSP_QA__?.startTransport?.()`, 25_000);
    const playing = await evalPage<boolean>(s, 'window.__BSP_QA__?.snapshot?.()?.playing', 10_000);
    if (playing) break;
    await Bun.sleep(500);
  }
  await evalPage(s, `window.__BSP_QA__?.waitForPlaying?.(15000)`, 20_000);
  if (!(await evalPage<boolean>(s, 'window.__BSP_QA__?.snapshot?.()?.playing', 10_000))) {
    throw new Error('Transport never started');
  }

  await evalPage(
    s,
    `window.__BSP_QA__?.waitForAnalysis?.('ready', 90000)`,
    95_000
  );

  const motion = await evalPage<{
    phaseDelta?: number;
    transportDelta?: number;
    playing?: boolean;
  }>(s, `window.__BSP_QA__?.sampleBeatMotion?.(1500)`, 20_000);

  const controls = await evalPage<{
    controlsApplied?: boolean;
    rateEvents?: number;
    after?: { soundTouch?: { tempo?: number; volume?: number } };
  }>(s, `window.__BSP_QA__?.exerciseAudioControls?.()`, 15_000);

  await evalPage(s, `window.__BSP_QA__?.stopTransport?.()`, 10_000);

  const snap = await evalPage<{
    playing?: boolean;
    analysisStatus?: string;
    analysisError?: string | null;
    soundTouchActive?: boolean;
    bpm?: number;
    bpmLocked?: boolean;
    usingUploadedTrack?: boolean;
    clipsLoaded?: number;
    amplitude?: number;
  }>(s, 'window.__BSP_QA__?.snapshot?.()', 15_000);

  const report = {
    passed:
      snap?.analysisStatus === 'ready' &&
      Boolean(snap?.soundTouchActive) &&
      (Boolean(snap?.usingUploadedTrack) ||
        snap?.trackName === 'redline.wav' ||
        Boolean(snap?.trackName)) &&
      (snap?.bpm ?? 0) >= 60 &&
      !snap?.bpmLocked &&
      Boolean(controls?.controlsApplied) &&
      ((controls?.rateEvents ?? 0) >= 1 ||
        (controls?.after?.soundTouch?.tempo ?? 1) !== 1) &&
      (motion?.phaseDelta ?? 0) > 0.05 &&
      (motion?.transportDelta ?? 0) > 0.2,
    playing: snap?.playing,
    analysisStatus: snap?.analysisStatus,
    analysisError: snap?.analysisError,
    soundTouchActive: snap?.soundTouchActive,
    bpm: snap?.bpm,
    bpmLocked: snap?.bpmLocked,
    clipsLoaded: snap?.clipsLoaded,
    motion,
    controls,
    note: 'Headless gate — confirm audibly in IDE browser before marking README manual items'
  };

  await Bun.write(`${ARTIFACT_DIR}/audio-report.json`, JSON.stringify(report, null, 2));
  s.close();

  if (!report.passed) throw new Error(`Audio gate failed: ${JSON.stringify(report)}`);
  console.log(
    'verify-audio PASSED',
    `soundTouch=${report.soundTouchActive}`,
    `rhy=${report.analysisStatus}`,
    `bpm=${report.bpm}`,
    `motion=${motion?.phaseDelta?.toFixed(2)}`
  );
});
