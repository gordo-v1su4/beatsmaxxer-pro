import {
  dispatchUserGesture,
  evalPage,
  navigateAndReady,
  waitForQaSongAndRhythm,
  withChrome
} from './cdp.ts';

const QA_URL =
  process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1&qaSequencerArm=1';
const CLIP_WAIT_MS = Number(process.env.CLIP_WAIT_MS ?? 45_000);

await withChrome('verify-sequencer-cut', 9612, async (session) => {
  await navigateAndReady(session, QA_URL);
  await evalPage(
    session,
    `window.__BMX_QA__?.waitForSequencerArmed?.(90000)`,
    95_000,
    'wait for qaSequencerArm autoload'
  );

  await evalPage(
    session,
    `window.__BMX_QA__?.waitForClips?.(4, ${CLIP_WAIT_MS})`,
    CLIP_WAIT_MS + 10_000
  );
  await waitForQaSongAndRhythm(session);

  for (let attempt = 0; attempt < 3; attempt++) {
    await dispatchUserGesture(session);
    await evalPage(session, `window.__BMX_QA__?.startTransport?.()`, 25_000);
    const playing = await evalPage<boolean>(
      session,
      'window.__BMX_QA__?.snapshot?.()?.playing',
      10_000
    );
    if (playing) break;
    await Bun.sleep(500);
  }
  await evalPage(session, `window.__BMX_QA__?.waitForPlaying?.(20000)`, 25_000);

  const nudge = (await evalPage(
    session,
    `window.__BMX_QA__?.exerciseQaArmedSequencerCut?.({ durationMs: 20000, pollMs: 200 })`,
    90_000
  )) as {
    stepMoved?: boolean;
    pgmMoved?: boolean;
    pgmCutCount?: number;
    before?: { arrangementCutCount?: number; playing?: boolean; pgmModule?: string };
    after?: { arrangementCutCount?: number; playing?: boolean; pgmModule?: string };
    cutLatency?: { count?: number };
  } | null;

  const stepMoved = Boolean(nudge?.stepMoved);
  const pgmMoved = Boolean(nudge?.pgmMoved);
  const pgmCutCount = nudge?.pgmCutCount ?? nudge?.cutLatency?.count ?? 0;
  const cutCount = nudge?.after?.arrangementCutCount ?? nudge?.before?.arrangementCutCount ?? 0;
  const pgmCutObserved = pgmMoved || pgmCutCount > 0;

  const report = {
    passed: cutCount > 0 && stepMoved && pgmCutObserved,
    stepMoved,
    pgmMoved,
    pgmCutCount,
    cutCount,
    nudge
  };

  session.close();
  if (!report.passed) {
    throw new Error(`Sequencer cut gate failed: ${JSON.stringify(report)}`);
  }
  console.log(
    'verify-sequencer-cut PASSED',
    `cuts=${cutCount}`,
    `stepMoved=${stepMoved}`,
    `pgmMoved=${pgmMoved}`,
    `pgmCutCount=${pgmCutCount}`
  );
});
