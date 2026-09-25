import { evalPage, navigateAndReady, waitForQaSongAndRhythm, withChrome } from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1';
const CLIP_WAIT_MS = Number(process.env.CLIP_WAIT_MS ?? 45_000);

await withChrome('verify-arrangement-rec', 9615, async (session) => {
  await navigateAndReady(session, QA_URL);
  await evalPage(
    session,
    `window.__BMX_QA__?.waitForClips?.(4, ${CLIP_WAIT_MS})`,
    CLIP_WAIT_MS + 10_000
  );
  await waitForQaSongAndRhythm(session);

  const result = (await evalPage(
    session,
    `window.__BMX_QA__?.exerciseQaArrangementRec?.()`,
    15_000
  )) as {
    recording?: boolean;
    clipCount?: number;
    triggerCount?: number;
    clip?: { endSeconds?: number | null; startSeconds?: number };
  } | null;

  session.close();

  if (
    !result ||
    result.recording !== false ||
    (result.clipCount ?? 0) < 1 ||
    (result.triggerCount ?? 0) < 1 ||
    result.clip?.endSeconds == null
  ) {
    throw new Error(`Arrangement REC gate failed: ${JSON.stringify(result)}`);
  }
  console.log('verify-arrangement-rec PASSED', JSON.stringify(result));
});
