import {
  dispatchUserGesture,
  evalPage,
  navigateAndReady,
  waitForQaSongAndRhythm,
  withChrome
} from './cdp.ts';

const QA_URL =
  process.env.QA_URL ??
  'http://127.0.0.1:5174/?qa=1&qaAutoplay=1&qaSequencerArm=1&qaLoopRegion=1';
const CLIP_WAIT_MS = Number(process.env.CLIP_WAIT_MS ?? 45_000);

await withChrome('verify-sequencer-loop', 9613, async (session) => {
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

  const loopSnap = await evalPage<{ loopStartSeconds: number | null; loopEndSeconds: number | null; sequencerArmed: boolean }>(
    session,
    'window.__BMX_QA__?.snapshot?.()',
    10_000
  );
  if (
    loopSnap?.loopStartSeconds == null ||
    loopSnap?.loopEndSeconds == null ||
    loopSnap.loopEndSeconds <= loopSnap.loopStartSeconds + 0.4
  ) {
    throw new Error(`Loop region autoload failed: ${JSON.stringify(loopSnap)}`);
  }
  if (!loopSnap.sequencerArmed) {
    throw new Error('Sequencer must stay ARMED with qaLoopRegion autoload');
  }

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

  const result = (await evalPage(
    session,
    `window.__BMX_QA__?.exerciseQaLoopWrapWithArmed?.()`,
    30_000
  )) as { wrapped?: boolean; positionSeconds?: number; loop?: { startSeconds: number } } | null;

  if (!result?.wrapped || (result.positionSeconds ?? 99) > (result.loop?.startSeconds ?? 0) + 0.75) {
    throw new Error(`Sequencer loop gate failed: ${JSON.stringify(result)}`);
  }

  const rec = (await evalPage(
    session,
    `window.__BMX_QA__?.exerciseQaArrangementRec?.()`,
    15_000
  )) as {
    recording?: boolean;
    clipCount?: number;
    triggerCount?: number;
    clip?: { endSeconds?: number | null };
  } | null;
  const stillArmed = await evalPage<boolean>(
    session,
    'window.__BMX_QA__?.snapshot?.()?.sequencerArmed',
    10_000
  );
  if (
    !rec ||
    rec.recording !== false ||
    (rec.clipCount ?? 0) < 1 ||
    (rec.triggerCount ?? 0) < 1 ||
    rec.clip?.endSeconds == null ||
    !stillArmed
  ) {
    throw new Error(
      `Loop + ARMED + REC gate failed: rec=${JSON.stringify(rec)} armed=${String(stillArmed)}`
    );
  }

  session.close();
  console.log('verify-sequencer-loop PASSED', JSON.stringify(result));
  console.log('verify-sequencer-loop REC-with-loop OK', JSON.stringify(rec));
});
