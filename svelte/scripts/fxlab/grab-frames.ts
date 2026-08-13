/** Decode a clip with Chromium (the same HTMLVideoElement path the app uses)
 *  and write individual frames as PNG. The bundled ffmpeg has no VP9 decoder. */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { CHROME_ARGS, chromeExecutable } from './env';

const clip = process.argv[2];
const outDir = process.argv[3];
const count = Number(process.argv[4] ?? 8);
const width = Number(process.argv[5] ?? 480);

const browser = await chromium.launch({
  executablePath: chromeExecutable(),
  args: [...CHROME_ARGS, '--autoplay-policy=no-user-gesture-required']
});
const page = await browser.newPage();
await page.setContent('<body style="margin:0"><video id=v muted playsinline></video><canvas id=c></canvas></body>');

const frames = await page.evaluate(
  async ({ dataUrl, count, width }) => {
    const v = document.getElementById('v') as HTMLVideoElement;
    v.src = dataUrl;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error('video load failed'));
    });
    const h = Math.round((width * v.videoHeight) / v.videoWidth);
    const c = document.getElementById('c') as HTMLCanvasElement;
    c.width = width;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const t = (v.duration * i) / count;
      await new Promise<void>((res) => {
        v.onseeked = () => res();
        v.currentTime = Math.min(t, Math.max(0, v.duration - 0.02));
      });
      ctx.drawImage(v, 0, 0, width, h);
      out.push(c.toDataURL('image/png'));
    }
    return out;
  },
  {
    dataUrl: 'data:video/webm;base64,' + readFileSync(clip).toString('base64'),
    count,
    width
  }
);

await browser.close();
mkdirSync(outDir, { recursive: true });
frames.forEach((f, i) => {
  writeFileSync(`${outDir}/f${String(i).padStart(3, '0')}.png`, Buffer.from(f.split(',')[1], 'base64'));
});
console.log(`wrote ${frames.length} frames to ${outDir}`);
