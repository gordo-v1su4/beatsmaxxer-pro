import { spawnChrome, connectCdp, evalPage } from './cdp.ts';

console.log('[verify-playback] starting');
const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1&qaAutoplay=1';
const port = 9899;
const proc = spawnChrome(port, `/tmp/bsp-vp-${Date.now()}`);
console.log('[verify-playback] chrome port', port);

try {
  const s = await connectCdp(port);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Page.navigate', { url: QA_URL });
  await Bun.sleep(8000);
  await evalPage(s, 'window.__BSP_QA__?.startTransport?.()');
  await Bun.sleep(500);
  const t0 = await evalPage(s, 'window.__BSP_QA__?.snapshot?.()');
  await Bun.sleep(1500);
  const t1 = await evalPage(s, 'window.__BSP_QA__?.snapshot?.()');
  let videoDelta = 0;
  for (const k of Object.keys(t1?.modules ?? {})) {
    const d = (t1.modules[k].currentTime ?? 0) - (t0?.modules?.[k]?.currentTime ?? 0);
    if (d > videoDelta) videoDelta = d;
  }
  const readyCount = Object.values(t1?.modules ?? {}).filter((m) => m.hasReadyFrame).length;
  const report = {
    passed: readyCount >= 8 && videoDelta > 0.15,
    clipsLoaded: t1?.clipsLoaded,
    readyCount,
    videoDelta,
    webgpu: t1?.webgpu,
    bpm: t1?.bpm,
    modules: t1?.modules
  };
  await Bun.write('.artifacts/playback-report.json', JSON.stringify(report, null, 2));
  s.close();
  if (!report.passed) throw new Error(`Playback acceptance failed: ${JSON.stringify(report)}`);
  console.log('verify-playback PASSED', `${readyCount}/8`, `delta=${videoDelta.toFixed(2)}s`);
} finally {
  proc.kill(9);
}
