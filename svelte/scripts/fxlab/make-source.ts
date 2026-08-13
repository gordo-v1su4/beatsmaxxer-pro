/**
 * Synthetic subjects for judging effects against.
 *
 * The committed QA clip is a flat teal frame-counter. It has no shadows, no
 * speculars and no midtone detail, so an effect that destroys all three still
 * looks fine over it -- which is how a light leak that fogged the whole picture
 * to grey survived review. These frames carry the tonal range an effect has to
 * respect:
 *
 *   reference  dusk skyline: near-black ground for fog to lift, a blown
 *              practical for bloom to key off (highlight-selective branches
 *              render nothing without one), midtone architecture with hard
 *              edges, plus a step wedge and colour patches along the bottom
 *   grey       flat mid grey, so a geometry can be seen on its own with no
 *              scene content confusing what the effect contributed
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { CHROME_ARGS, chromeExecutable } from './env';

export async function makeSources(dir: string, width = 480) {
  mkdirSync(dir, { recursive: true });
  const height = Math.round((width * 9) / 16);
  const browser = await chromium.launch({
    executablePath: chromeExecutable(),
    args: CHROME_ARGS
  });
  const page = await browser.newPage();
  await page.setContent('<body style="margin:0"><canvas id=c></canvas></body>');

  const urls = await page.evaluate(
    ({ W, H }) => {
      const c = document.getElementById('c') as HTMLCanvasElement;
      c.width = W;
      c.height = H;
      const x = c.getContext('2d')!;

      x.fillStyle = '#6a6a6a';
      x.fillRect(0, 0, W, H);
      const grey = c.toDataURL('image/png');

      const wedgeTop = H * 0.84;
      const sky = x.createLinearGradient(0, 0, 0, wedgeTop);
      sky.addColorStop(0.0, '#0a0f1c');
      sky.addColorStop(0.55, '#243349');
      sky.addColorStop(0.82, '#6b5136');
      sky.addColorStop(1.0, '#101418');
      x.fillStyle = sky;
      x.fillRect(0, 0, W, wedgeTop);

      const sunX = W * 0.72;
      const sunY = wedgeTop * 0.34;
      const halo = x.createRadialGradient(sunX, sunY, 0, sunX, sunY, W * 0.16);
      halo.addColorStop(0.0, 'rgba(255,252,240,1)');
      halo.addColorStop(0.18, 'rgba(255,236,190,0.85)');
      halo.addColorStop(1.0, 'rgba(255,200,120,0)');
      x.fillStyle = halo;
      x.fillRect(0, 0, W, wedgeTop);
      x.fillStyle = '#fffdf6';
      x.beginPath();
      x.arc(sunX, sunY, W * 0.022, 0, 7);
      x.fill();

      x.fillStyle = '#1b2027';
      const towers = [
        [0.04, 0.42, 0.1, 0.42],
        [0.15, 0.3, 0.07, 0.54],
        [0.23, 0.48, 0.12, 0.36],
        [0.86, 0.36, 0.11, 0.48]
      ];
      for (const [bx, by, bw, bh] of towers) x.fillRect(bx * W, by * wedgeTop, bw * W, bh * wedgeTop);
      x.fillStyle = 'rgba(255,214,140,0.9)';
      for (let i = 0; i < 46; i++) {
        const t = towers[i % towers.length];
        const wx = (t[0] + 0.012 + ((i * 7) % 5) * 0.018) * W;
        const wy = (t[1] + 0.05 + ((i * 13) % 9) * 0.045) * wedgeTop;
        if (wy < (t[1] + t[3]) * wedgeTop - 6) x.fillRect(wx, wy, W * 0.008, W * 0.008);
      }

      const gnd = x.createLinearGradient(0, wedgeTop * 0.72, 0, wedgeTop);
      gnd.addColorStop(0, '#05070a');
      gnd.addColorStop(1, '#0d1116');
      x.fillStyle = gnd;
      x.fillRect(0, wedgeTop * 0.72, W, wedgeTop * 0.28);
      const refl = x.createLinearGradient(sunX, wedgeTop * 0.72, sunX, wedgeTop);
      refl.addColorStop(0, 'rgba(255,190,110,0.30)');
      refl.addColorStop(1, 'rgba(255,190,110,0)');
      x.fillStyle = refl;
      x.fillRect(sunX - W * 0.05, wedgeTop * 0.72, W * 0.1, wedgeTop * 0.28);

      // Fine grain, so a smooth synthetic gradient laid on top is obvious.
      const img = x.getImageData(0, 0, W, Math.round(wedgeTop));
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 9;
        img.data[i] += n;
        img.data[i + 1] += n;
        img.data[i + 2] += n;
      }
      x.putImageData(img, 0, 0);

      const steps = 11;
      for (let i = 0; i < steps; i++) {
        const v = Math.round((i / (steps - 1)) * 255);
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect((i / steps) * W, wedgeTop, W / steps + 1, (H - wedgeTop) * 0.6);
      }
      const hues = ['#c81e2d', '#1e8fc8', '#2fa84f', '#d8b021', '#8a3fb5', '#d8d2c4'];
      hues.forEach((h, i) => {
        x.fillStyle = h;
        x.fillRect(
          (i / hues.length) * W,
          wedgeTop + (H - wedgeTop) * 0.6,
          W / hues.length + 1,
          (H - wedgeTop) * 0.4
        );
      });
      return { reference: c.toDataURL('image/png'), grey };
    },
    { W: width, H: height }
  );

  await browser.close();
  const paths = {
    reference: `${dir}/reference.png`,
    grey: `${dir}/grey.png`
  };
  writeFileSync(paths.reference, Buffer.from(urls.reference.split(',')[1], 'base64'));
  writeFileSync(paths.grey, Buffer.from(urls.grey.split(',')[1], 'base64'));
  return paths;
}
