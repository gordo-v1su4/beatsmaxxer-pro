import { dispatchUserGesture, evalPage, navigateAndReady, withChrome } from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;

type SampleRow = {
  t: number;
  beat: number;
  pgmModule: string;
  effectMode?: number;
  effectModuleId?: string;
  hasVideo?: number;
  samplePath?: string;
  tsTime: number;
  tsRate: number;
  tsReady: boolean;
};

type PresetReport = {
  presetId: string;
  passed: boolean;
  beatMoved: boolean;
  modeOk: boolean;
  pgmOk: boolean;
  videoOk: boolean;
  timeMoved: boolean;
  jumps: number;
  maxJump: number;
  params: Record<string, number>;
  first?: SampleRow;
  last?: SampleRow;
};

async function sampleTimesamplerPgm(session: Awaited<ReturnType<typeof withChrome>> extends Promise<infer S> ? S : never, presetId: string): Promise<PresetReport> {
  await evalPage(session, `window.__BMX_QA__?.applyVisualProofItem(${JSON.stringify(presetId)})`, 20_000);
  await evalPage(session, `window.__BMX_QA__?.cutEightVideoPgm('timesampler', 300)`, 20_000);

  return evalPage<PresetReport>(
    session,
    `(async () => {
      const qa = window.__BMX_QA__;
      const presetId = ${JSON.stringify(presetId)};
      const params = qa.snapshot().params?.timesampler ?? {};
      const samples = [];
      for (let i = 0; i < 36; i++) {
        const snap = qa.snapshot();
        const pgm = snap.render?.pgm ?? {};
        const ts = snap.modules?.timesampler ?? {};
        samples.push({
          t: i * 150,
          beat: snap.beat,
          pgmModule: snap.pgmModule,
          effectMode: pgm.effectMode,
          effectModuleId: pgm.effectModuleId,
          hasVideo: pgm.hasVideo,
          samplePath: pgm.samplePath,
          tsTime: ts.currentTime ?? 0,
          tsRate: ts.playbackRate ?? 1,
          tsReady: ts.hasReadyFrame === true
        });
        await new Promise((r) => setTimeout(r, 150));
      }

      const times = samples.map((s) => s.tsTime).filter((t) => Number.isFinite(t));
      let jumps = 0;
      let maxJump = 0;
      for (let i = 1; i < times.length; i++) {
        const delta = Math.abs(times[i] - times[i - 1]);
        if (delta > 0.35) {
          jumps++;
          maxJump = Math.max(maxJump, delta);
        }
      }

      const beatMoved = Number(samples.at(-1)?.beat) > Number(samples[0]?.beat);
      const modeOk = samples.every((s) => s.effectMode === 4 && s.effectModuleId === 'timesampler');
      const pgmOk = samples.every((s) => s.pgmModule === 'timesampler');
      const videoOk = samples.every(
        (s) =>
          s.hasVideo === 1 ||
          s.samplePath === 'external-texture' ||
          s.samplePath === 'cached-video-texture'
      );
      const timeMoved = Math.abs(Number(times.at(-1)) - Number(times[0])) > 0.05;

      return {
        presetId,
        passed: beatMoved && modeOk && pgmOk && videoOk && timeMoved && jumps >= 1,
        beatMoved,
        modeOk,
        pgmOk,
        videoOk,
        timeMoved,
        jumps,
        maxJump,
        params,
        first: samples[0],
        last: samples.at(-1)
      };
    })()`,
    30_000
  );
}

await withChrome('g008-timesampler', 9961, async (session) => {
  await navigateAndReady(session, QA_URL);
  await evalPage(session, `window.__BMX_QA__?.waitForClips?.(8, 45000)`, 55_000);
  await dispatchUserGesture(session);
  for (let attempt = 0; attempt < 3; attempt++) {
    await evalPage(session, `window.__BMX_QA__?.startTransport?.()`, 25_000);
    const playing = await evalPage<boolean>(session, 'window.__BMX_QA__?.snapshot?.()?.playing', 10_000);
    if (playing) break;
    await dispatchUserGesture(session);
    await Bun.sleep(500);
  }
  await evalPage(session, `window.__BMX_QA__?.waitForPlaying?.(15000)`, 20_000);

  const presets = ['preset:timesampler:1', 'preset:timesampler:2', 'preset:timesampler:3'] as const;
  const reports: PresetReport[] = [];
  for (const presetId of presets) {
    reports.push(await sampleTimesamplerPgm(session, presetId));
  }

  const moduleMotion = await evalPage<{
    beatMoved: boolean;
    timesamplerTimeMoved: boolean;
    speedrampRateVaried: boolean;
    allReady: boolean;
  }>(session, `window.__BMX_QA__?.sampleTimeModules?.(2500)`, 15_000);

  const report = {
    passed: reports.every((r) => r.passed) && Boolean(moduleMotion?.timesamplerTimeMoved),
    presets: reports,
    moduleMotion
  };

  await Bun.write(`${ARTIFACT_DIR}/g008-timesampler-report.json`, JSON.stringify(report, null, 2));
  session.close();

  if (!report.passed) {
    throw new Error(`G008 timesampler gate failed: ${JSON.stringify(report)}`);
  }

  console.log(
    'G008 timesampler PASSED',
    reports.map((r) => `${r.presetId} jumps=${r.jumps} max=${r.maxJump.toFixed(2)}s`).join(' | ')
  );
});
