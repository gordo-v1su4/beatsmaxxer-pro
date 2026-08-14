/**
 * Render the compiled module shader headlessly and write a contact sheet.
 *
 * Uniform indices are copied from WebGpuEngine.encodeBinding, so a cell here is
 * fed exactly what a rack canvas is fed at runtime. If that packing changes,
 * change it here too -- the layout is the contract between the two.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { CHROME_ARGS, FXLAB_OUT, chromeExecutable } from './env';

export type Cell = {
  label: string;
  /** Effect mode from SHADER_EFFECT_MODE. */
  mode: number;
  /** 0-100 UI values, matching what paramsForGpu hands the engine. */
  mix?: number;
  p0?: number;
  p1?: number;
  p2?: number;
  p3?: number;
  beat?: number;
  beatPhase?: number;
  playing?: number;
  amplitude?: number;
  bassAmp?: number;
  accentRgb?: [number, number, number];
  aspect?: number;
  aux1?: number;
  aux2?: number;
  /** Beats since a MIDI trigger; omit (or negative) to follow the beat grid. */
  triggerAge?: number;
  /** Rack groove: 0 straight, 1 swing, 2 dotted. */
  feel?: number;
  /** PNG path bound as the video texture. Omit to render the idle test card. */
  source?: string;
};

export type Sheet = {
  cells: Cell[];
  cols: number;
  cellWidth?: number;
  cellHeight?: number;
  labels?: boolean;
  title?: string;
};

function uniformArray(c: Cell): number[] {
  const d = new Array(32).fill(0);
  d[0] = c.beat ?? 0;
  d[1] = c.beatPhase ?? 0;
  d[2] = 120;
  d[3] = c.playing ?? 1;
  d[4] = c.amplitude ?? 0;
  d[5] = c.bassAmp ?? 0;
  d[6] = (c.mix ?? 100) / 100;
  d[7] = c.mode;
  d[8] = (c.p0 ?? 50) / 100;
  d[9] = (c.p1 ?? 50) / 100;
  d[10] = (c.p2 ?? 50) / 100;
  d[11] = (c.p3 ?? 50) / 100;
  d[14] = c.source ? 1 : 0;
  const acc = c.accentRgb ?? [0.976, 0.451, 0.086];
  d[15] = acc[0];
  d[16] = acc[1];
  d[17] = acc[2];
  d[19] = c.aspect ?? 16 / 9;
  d[20] = c.aux1 ?? 1;
  d[21] = c.aux2 ?? 0;
  d[23] = 1 / 60;
  d[26] = 1;
  d[30] = c.triggerAge ?? -1;
  d[31] = c.feel ?? 0;
  return d;
}

export async function renderSheet(sheet: Sheet, outPath: string) {
  const vert = readFileSync(`${FXLAB_OUT}/module.vert`, 'utf8');
  const frag = readFileSync(`${FXLAB_OUT}/module.frag`, 'utf8');

  const sources = new Map<string, string>();
  for (const c of sheet.cells) {
    if (c.source && !sources.has(c.source)) {
      sources.set(c.source, 'data:image/png;base64,' + readFileSync(c.source).toString('base64'));
    }
  }

  const browser = await chromium.launch({
    executablePath: chromeExecutable(),
    args: CHROME_ARGS
  });
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && console.error('[fxlab page]', m.text()));
  await page.setContent('<body style="margin:0;background:#000"><canvas id=sheet></canvas></body>');

  const payload = {
    vert,
    frag,
    cols: sheet.cols,
    cellWidth: sheet.cellWidth ?? 320,
    cellHeight: sheet.cellHeight ?? 180,
    labels: sheet.labels !== false,
    title: sheet.title ?? '',
    sources: [...sources.entries()],
    cells: sheet.cells.map((c) => ({
      label: c.label,
      uniforms: uniformArray(c),
      source: c.source ?? null
    }))
  };

  const dataUrl = await page.evaluate(async (job) => {
    const imgs = new Map<string, HTMLImageElement>();
    await Promise.all(
      job.sources.map(
        ([k, v]) =>
          new Promise<void>((res, rej) => {
            const im = new Image();
            im.onload = () => {
              imgs.set(k, im);
              res();
            };
            im.onerror = () => rej(new Error('source image ' + k));
            im.src = v;
          })
      )
    );

    const gpu = document.createElement('canvas');
    gpu.width = job.cellWidth;
    gpu.height = job.cellHeight;
    const gl = gpu.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('no webgl2 context');

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error('shader compile: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, job.vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, job.frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    // naga emits a separate uniform block per stage; point them all at one buffer.
    const ubo = gl.createBuffer()!;
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, 32 * 4, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
    const blocks = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORM_BLOCKS) as number;
    for (let i = 0; i < blocks; i++) gl.uniformBlockBinding(prog, i, 0);

    const makeTexture = (unit: number) => {
      const t = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255]));
      return t;
    };
    const videoTex = makeTexture(0);
    makeTexture(1); // feedback; never sampled by the effects under test
    for (const [name, unit] of [
      ['_group_0_binding_1_fs', 0],
      ['_group_0_binding_3_fs', 1]
    ] as const) {
      const loc = gl.getUniformLocation(prog, name);
      if (loc) gl.uniform1i(loc, unit);
    }

    const rows = Math.ceil(job.cells.length / job.cols);
    const labelH = job.labels ? 18 : 0;
    const titleH = job.title ? 26 : 0;
    const pad = 6;
    const sheet = document.getElementById('sheet') as HTMLCanvasElement;
    sheet.width = job.cols * (job.cellWidth + pad) + pad;
    sheet.height = titleH + rows * (job.cellHeight + labelH + pad) + pad;
    const ctx = sheet.getContext('2d')!;
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    if (job.title) {
      ctx.fillStyle = '#e8eaed';
      ctx.font = '600 14px monospace';
      ctx.fillText(job.title, pad, 18);
    }

    for (let i = 0; i < job.cells.length; i++) {
      const cell = job.cells[i];
      const src = cell.source ? imgs.get(cell.source) : null;
      if (src) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, videoTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      }
      gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, new Float32Array(cell.uniforms));
      gl.viewport(0, 0, job.cellWidth, job.cellHeight);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const cx = pad + (i % job.cols) * (job.cellWidth + pad);
      const cy = titleH + pad + Math.floor(i / job.cols) * (job.cellHeight + labelH + pad);
      // WebGL's framebuffer origin is bottom-left while the shader's UVs assume
      // WebGPU's top-left, so the readback arrives mirrored. Flipping it back
      // here makes the cell match what the app draws.
      ctx.save();
      ctx.translate(cx, cy + job.cellHeight);
      ctx.scale(1, -1);
      ctx.drawImage(gpu, 0, 0);
      ctx.restore();
      if (job.labels) {
        ctx.fillStyle = '#9aa0a6';
        ctx.font = '500 11px monospace';
        ctx.fillText(cell.label, cx + 1, cy + job.cellHeight + 13);
      }
    }
    return sheet.toDataURL('image/png');
  }, payload);

  await browser.close();
  mkdirSync(outPath.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return outPath;
}
