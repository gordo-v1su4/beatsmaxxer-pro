import { spawnChrome, connectCdp, evalPage } from './cdp.ts';

const port = 9898;
const proc = spawnChrome(port, `/tmp/bsp-int-${Date.now()}`);
try {
  const s = await connectCdp(port);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Page.navigate', { url: 'http://127.0.0.1:5174/?qa=1' });
  await Bun.sleep(8000);
  const result = await evalPage<{ clicks: number; errors: string[] }>(s, `(() => {
    const errors = [];
    let clicks = 0;
    try {
      for (const btn of [...document.querySelectorAll('button')].slice(0, 12)) {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        clicks++;
      }
      for (const r of [...document.querySelectorAll('input[type=range]')].slice(0, 6)) {
        r.dispatchEvent(new Event('input', { bubbles: true }));
        clicks++;
      }
    } catch (e) { errors.push(String(e)); }
    return { clicks, errors };
  })()`);
  const report = {
    passed: (result?.clicks ?? 0) >= 5 && (result?.errors?.length ?? 0) === 0,
    ...result
  };
  await Bun.write('.artifacts/interaction-report.json', JSON.stringify(report, null, 2));
  s.close();
  if (!report.passed) throw new Error(`Interaction failed: ${JSON.stringify(report)}`);
  console.log('verify-interaction PASSED clicks=' + report.clicks);
} finally {
  proc.kill(9);
}
