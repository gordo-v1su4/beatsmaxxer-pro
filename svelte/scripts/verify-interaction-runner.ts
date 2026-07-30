import { evalPage, navigateAndReady, screenshotPng, withChrome } from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1';
const ARTIFACT_DIR = process.env.ARTIFACT_DIR ?? `${import.meta.dir}/../.artifacts`;

await withChrome('verify-interaction', 9700, async (s) => {
  await navigateAndReady(s, QA_URL);
  await Bun.sleep(3000);

  const result = await evalPage<{ clicks: number; errors: string[] }>(
    s,
    `(() => {
    window.__BSP_ERRS__ = [];
    const errors = [];
    let clicks = 0;
    try {
      for (const btn of [...document.querySelectorAll('button')].slice(0, 16)) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        clicks++;
      }
      for (const r of [...document.querySelectorAll('input[type=range]')].slice(0, 8)) {
        r.dispatchEvent(new Event('input', { bubbles: true }));
        clicks++;
      }
    } catch (e) { errors.push(String(e)); }
    return { clicks, errors: (window.__BSP_ERRS__ || []).concat(errors) };
  })()`,
    15_000
  );

  if (process.env.SCREENSHOT === '1') {
    await screenshotPng(s, `${ARTIFACT_DIR}/interaction.png`);
  }

  const report = {
    passed: (result?.clicks ?? 0) >= 5 && (result?.errors?.length ?? 0) === 0,
    ...result
  };

  await Bun.write(`${ARTIFACT_DIR}/interaction-report.json`, JSON.stringify(report, null, 2));
  s.close();

  if (!report.passed) throw new Error(`Interaction failed: ${JSON.stringify(report)}`);
  console.log('verify-interaction PASSED clicks=' + report.clicks);
});
