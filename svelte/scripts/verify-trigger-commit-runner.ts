import { evalPage, navigateAndReady, waitForQaSongAndRhythm, withChrome } from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1';
const CLIP_WAIT_MS = Number(process.env.CLIP_WAIT_MS ?? 45_000);

await withChrome('verify-trigger-commit', 9614, async (session) => {
  await navigateAndReady(session, QA_URL);
  await evalPage(
    session,
    `window.__BMX_QA__?.waitForClips?.(4, ${CLIP_WAIT_MS})`,
    CLIP_WAIT_MS + 10_000
  );
  await waitForQaSongAndRhythm(session);

  await evalPage(session, `window.__BMX_QA__?.seedQaTriggerMarksForCommit?.()`, 10_000);
  const moved = await evalPage<{ seconds?: number }>(
    session,
    `window.__BMX_QA__?.moveQaTriggerMark?.('qa-trigger-a', 1.55)`,
    10_000
  );
  if (moved?.seconds !== 1.55) {
    throw new Error(`Trigger mark move failed: ${JSON.stringify(moved)}`);
  }

  const commit = (await evalPage(
    session,
    `window.__BMX_QA__?.commitQaTriggerMarksForQa?.()`,
    15_000
  )) as {
    committed?: number;
    cutCountBefore?: number;
    cutCountAfter?: number;
    beatGridLength?: number;
    totalSteps?: number;
  } | null;

  session.close();

  if (
    !commit ||
    (commit.committed ?? 0) < 1 ||
    (commit.cutCountAfter ?? 0) <= (commit.cutCountBefore ?? 0) ||
    (commit.totalSteps ?? 0) < 1
  ) {
    throw new Error(`Trigger commit gate failed: ${JSON.stringify(commit)}`);
  }
  console.log('verify-trigger-commit PASSED', JSON.stringify(commit));
});
