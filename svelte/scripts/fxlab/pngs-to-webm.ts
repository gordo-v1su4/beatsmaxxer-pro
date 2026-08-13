/**
 * Encode the rendered frames to WebM inside Chromium.
 *
 * The bundled ffmpeg is a stripped Playwright build: it can ENCODE png and vp8
 * but has no png decoder and no pipe protocol, so it cannot read a frame
 * sequence back in. MediaRecorder over a canvas stream does the same job with
 * nothing extra installed. Frames are already decoded to ImageBitmap before
 * recording starts, so drawing keeps up with real time and none are dropped.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { CHROME_ARGS, chromeExecutable } from './env';

const dir = process.argv[2] ?? '';
const outPath = process.argv[3] ?? `${dir}/../out.webm`;
const FPS = 15;

const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const payload = files.map((f) => 'data:image/png;base64,' + readFileSync(`${dir}/${f}`).toString('base64'));
console.log(`encoding ${payload.length} frames`);

const browser = await chromium.launch({
  executablePath: chromeExecutable(),
  args: CHROME_ARGS
});
const page = await browser.newPage();
await page.setContent('<body style="margin:0"><canvas id=c></canvas></body>');

const b64 = await page.evaluate(
  async ({ frames, FPS }) => {
    const bitmaps: ImageBitmap[] = [];
    for (const src of frames) {
      const res = await fetch(src);
      bitmaps.push(await createImageBitmap(await res.blob()));
    }
    const c = document.getElementById('c') as HTMLCanvasElement;
    c.width = bitmaps[0].width;
    c.height = bitmaps[0].height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bitmaps[0], 0, 0);

    const stream = c.captureStream(FPS);
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: 4_000_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((res) => (rec.onstop = () => res()));
    rec.start();

    for (let i = 0; i < bitmaps.length; i++) {
      ctx.drawImage(bitmaps[i], 0, 0);
      await new Promise((r) => setTimeout(r, 1000 / FPS));
    }
    await new Promise((r) => setTimeout(r, 250));
    rec.stop();
    await done;

    const blob = new Blob(chunks, { type: 'video/webm' });
    const buf = await blob.arrayBuffer();
    let s = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  },
  { frames: payload, FPS }
);

await browser.close();
writeFileSync(outPath, Buffer.from(b64, 'base64'));
console.log('wrote', outPath);
