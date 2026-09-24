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
  await Bun.sleep(2000);

  const armed = (await evalPage(session, 'window.__BMX_QA__?.snapshot?.()', 15_000)) as {
    sequencerArmed?: boolean;
  } | null;
  if (!armed?.sequencerArmed) {
    throw new Error('verify-sequencer-cut: qaSequencerArm did not ARM');
  }

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

  const snap0 = (await evalPage(session, 'window.__BMX_QA__?.snapshot?.()', 15_000)) as {
    playing?: boolean;
    pgmModule?: string;
    sequencerLastStep?: number;
    arrangementCutCount?: number;
  } | null;
  await Bun.sleep(2500);
  const snap1 = (await evalPage(session, 'window.__BMX_QA__?.snapshot?.()', 15_000)) as typeof snap0;

  const stepMoved =
    (snap1?.sequencerLastStep ?? -1) !== (snap0?.sequencerLastStep ?? -1) &&
    (snap1?.sequencerLastStep ?? -1) >= 0;
  const pgmMoved =
    Boolean(snap0?.pgmModule) &&
    Boolean(snap1?.pgmModule) &&
    snap1!.pgmModule !== snap0!.pgmModule;

  const report = {
    passed:
      Boolean(snap1?.playing) &&
      (snap1?.arrangementCutCount ?? 0) > 0 &&
      (stepMoved || pgmMoved),
    stepMoved,
    pgmMoved,
    snap0,
    snap1
  };

  session.close();
  if (!report.passed) {
    throw new Error(`Sequencer cut gate failed: ${JSON.stringify(report)}`);
  }
  console.log(
    'verify-sequencer-cut PASSED',
    `cuts=${snap1?.arrangementCutCount}`,
    `stepMoved=${stepMoved}`,
    `pgmMoved=${pgmMoved}`
  );
});
