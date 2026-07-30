#!/usr/bin/env bun
/** Keep a visible Chrome window open with QA clips + music loaded. */
import { connectCdp, dispatchUserGesture, evalPage, navigateAndReady, pickDebugPort, spawnChrome } from './cdp.ts';

const QA_URL = process.env.QA_URL ?? 'http://127.0.0.1:5174/?qa=1';
const port = pickDebugPort(9200);
const userDataDir = '/tmp/bsp-demo-live';

console.log('[demo] Opening Beat Surfer Pro with QA media...');
console.log('[demo]', QA_URL);
console.log('[demo] Chrome debug port', port);

const proc = spawnChrome(port, userDataDir, true);
await Bun.sleep(800);

const session = await connectCdp(port, 20_000);
await navigateAndReady(session, QA_URL, undefined, 60_000);
await evalPage(session, `window.__BSP_QA__?.waitForClips?.(8, 60000)`, 70_000);

// Real click on PLAY — required for audio autoplay policy in headed Chrome.
await dispatchUserGesture(session);
const clickPlay = `(async () => {
  const btn = [...document.querySelectorAll('button')].find((b) => /PLAY/.test(b.textContent || ''));
  if (!btn) return { clicked: false };
  const r = btn.getBoundingClientRect();
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const snap = window.__BSP_QA__?.snapshot?.();
  return { clicked: true, playing: snap?.playing, bpm: snap?.bpm, clips: snap?.clipsLoaded, rhy: snap?.analysisStatus };
})()`;

let status = await evalPage<{
  clicked?: boolean;
  playing?: boolean;
  bpm?: number;
  clips?: number;
  rhy?: string;
}>(session, clickPlay, 20_000);

if (!status?.playing) {
  await dispatchUserGesture(session);
  status = await evalPage(session, clickPlay, 20_000);
}

console.log('[demo] clips=', status?.clips, 'bpm=', status?.bpm, 'playing=', status?.playing, 'rhy=', status?.rhy);
console.log('[demo] Track: redline.wav (133 BPM). Click PLAY in the top bar if audio is silent.');
console.log('[demo] Window stays open — close Chrome or Ctrl+C here to exit.');

process.on('SIGINT', () => {
  proc.kill(9);
  process.exit(0);
});

await proc.exited;
