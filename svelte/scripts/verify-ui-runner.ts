import { evalPage, navigateAndReady, screenshotPng, withChrome } from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;

await withChrome('verify-ui', 9500, async (s) => {
  await navigateAndReady(
    s,
    QA_URL,
    '!document.body.innerText.includes("Probing WebGPU") && document.body.innerText.includes("BEATSURFING")',
    45_000
  );

  const ui = await evalPage<{ ok: boolean; labels: string[] }>(
    s,
    `(() => {
      const labels = ["BEATSURFING", "PGM SOURCE", "TRANSITION"];
      const text = document.body.innerText;
      const ok = labels.every((t) => text.includes(t));
      return { ok, labels: labels.filter((t) => text.includes(t)) };
    })()`,
    10_000
  );

  if (process.env.SCREENSHOT === '1') {
    await screenshotPng(s, `${ARTIFACT_DIR}/ui-smoke.png`);
  }

  const report = {
    passed: Boolean(ui?.ok),
    labelsFound: ui?.labels ?? [],
    url: QA_URL
  };

  await Bun.write(`${ARTIFACT_DIR}/ui-report.json`, JSON.stringify(report, null, 2));
  s.close();

  if (!report.passed) throw new Error(`UI smoke failed: ${JSON.stringify(report)}`);
  console.log('verify-ui PASSED labels=' + report.labelsFound.join(','));
});
