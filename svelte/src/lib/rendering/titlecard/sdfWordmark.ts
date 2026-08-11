/**
 * Builds a signed distance field for the splash wordmark, at boot, from an
 * arbitrary string.
 *
 * There is no pre-baked atlas here on purpose. The word is meant to change
 * (BEATS MAXXER today, HERE WE GO or MAX tomorrow) and a checked-in PNG is a
 * thing nobody can regenerate six months from now. Rasterising through the 2D
 * canvas costs a few milliseconds once per session and keeps the input a
 * string.
 *
 * Four layers go into the four channels of one RGBA texture:
 *
 *   R  first half of the word    (flies in from the left)
 *   G  second half               (flies in from the right)
 *   B  the trailing small word   (PRO)
 *   A  the kicker line           (tiny letterspaced caps)
 *
 * Packing them as channels rather than as separate textures is what keeps the
 * shader to a single bind group and lets each group carry its own animated
 * offset from one texture fetch per group. The alternative — one texture per
 * layer — costs four bindings and four samplers to draw the same picture.
 *
 * The field is stored with 0.5 at the glyph edge and rising inward, so a
 * fragment shader reads it as a plain height: above 0.5 is inside. Distances
 * are normalised against SDF_RADIUS_RATIO of the cap height, which is what
 * makes the bevel and the outer bloom scale with the type rather than with the
 * pixel size of the canvas.
 */

/** Distance range the field encodes, as a fraction of font size. Everything
 *  beyond this saturates at 0 or 1, so it also sets how far the outer bloom can
 *  reach before it runs out of gradient to follow. */
const SDF_RADIUS_RATIO = 0.13;

/** The rasterisation is a means to an end — the shader resamples it smoothly —
 *  so this only has to be fine enough that the *field* is accurate, not fine
 *  enough to read as type. 1024 keeps the four distance transforms in the low
 *  milliseconds; 2048 quadruples that for no visible gain. */
const MAX_TEXTURE_WIDTH = 1024;

/** Forward lean. Shallow on purpose: past ~10 degrees the vertical stems of a
 *  heavy face start to read as a mistake rather than as speed. */
const SLANT_RADIANS = (7 * Math.PI) / 180;

export interface WordmarkSpec {
  /** Flies in from the left. */
  head: string;
  /** Flies in from the right, meeting `head` on the centre line. */
  tail: string;
  /** Small trailing word, set after the baseline of the main word. */
  suffix?: string;
  /** Letterspaced caps above the word. */
  kicker?: string;
  /** CSS font-family for the main word. Must already be loaded. */
  family: string;
  /** Extra tracking on the main word, as a fraction of font size. */
  tracking?: number;
}

export interface WordmarkSdf {
  /** RGBA8, one byte per channel per texel. */
  data: Uint8Array;
  width: number;
  height: number;
  /** Vertical span of the main word's cap height in texture UV, so the shader
   *  can run the chrome ramp over the letterface rather than over the padding. */
  bandTop: number;
  bandBottom: number;
  /** Horizontal centre of the seam between head and tail, in texture UV. Anchors
   *  the impact flash and the sparkle that fires where the halves collide. */
  seamU: number;
  /** How long the raster + four distance transforms took, in ms. Reported at
   *  boot because this runs on the main thread during the stall the splash is
   *  covering, so it has to stay honest about its own cost. */
  buildMs: number;
}

/** One layer's coverage, before it becomes a distance field. */
interface Layer {
  alpha: Float32Array;
  /** Tight bounds of the drawn pixels, or null when the layer is empty. */
  box: { x0: number; y0: number; x1: number; y1: number } | null;
}

/**
 * Exact 1D squared-distance transform (Felzenszwalb & Huttenlocher). Runs the
 * lower envelope of a set of parabolas in linear time — the standard core of
 * every SDF text rasteriser, and the reason this is milliseconds rather than
 * the seconds a naive nearest-pixel search would take.
 */
function edt1d(
  f: Float64Array,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
  n: number
): void {
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  let k = 0;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** Separable 2D squared-distance transform: columns, then rows. */
function edt2d(grid: Float64Array, w: number, h: number): void {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = grid[row + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[row + x] = d[x];
  }
}

/**
 * Coverage to signed distance, written straight into one channel of the output.
 *
 * Only the layer's own bounding box (grown by the field radius) is transformed.
 * The wordmark leaves most of the canvas empty and the four layers barely
 * overlap, so transforming the full canvas four times would spend roughly three
 * quarters of its work proving that blank space is still blank. Everything
 * outside the grown box is already 0 in the output buffer, which is the correct
 * answer — fully outside — because the box was grown by the radius that the
 * field saturates at.
 */
function writeChannel(
  layer: Layer,
  out: Uint8Array,
  width: number,
  height: number,
  channel: number,
  radius: number
): void {
  if (!layer.box) return;
  const pad = Math.ceil(radius) + 2;
  const x0 = Math.max(0, layer.box.x0 - pad);
  const y0 = Math.max(0, layer.box.y0 - pad);
  const x1 = Math.min(width - 1, layer.box.x1 + pad);
  const y1 = Math.min(height - 1, layer.box.y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w <= 0 || h <= 0) return;

  const outer = new Float64Array(w * h);
  const inner = new Float64Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = layer.alpha[(y + y0) * width + (x + x0)];
      const i = y * w + x;
      if (a <= 0) {
        outer[i] = 1e20;
        inner[i] = 0;
      } else if (a >= 1) {
        outer[i] = 0;
        inner[i] = 1e20;
      } else {
        // Antialiased edge pixels carry sub-texel position information. Seeding
        // both grids from the coverage keeps it, which is what stops the field
        // from being quantised to whole texels along near-horizontal strokes.
        const o = Math.max(0, 0.5 - a);
        const n = Math.max(0, a - 0.5);
        outer[i] = o * o;
        inner[i] = n * n;
      }
    }
  }

  edt2d(outer, w, h);
  edt2d(inner, w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Positive inside, negative outside, in texels.
      const signed = Math.sqrt(inner[i]) - Math.sqrt(outer[i]);
      const stored = Math.round(255 * clamp01(0.5 + (0.5 * signed) / radius));
      const dst = ((y + y0) * width + (x + x0)) * 4 + channel;
      // Layers are disjoint by construction, but max() rather than assignment
      // means an overlap degrades into a union instead of one layer punching a
      // hole through the other.
      if (stored > out[dst]) out[dst] = stored;
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Pull one channel of coverage out of a rendered 2D context. */
function readLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): Layer {
  const src = ctx.getImageData(0, 0, width, height).data;
  const alpha = new Float32Array(width * height);
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0, p = 3; i < alpha.length; i++, p += 4) {
    const a = src[p] / 255;
    if (a <= 0) continue;
    alpha[i] = a;
    const x = i % width;
    const y = (i - x) / width;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { alpha, box: x1 < 0 ? null : { x0, y0, x1, y1 } };
}

/**
 * Glyph advances for one run, measured individually so tracking is applied by
 * this code rather than by `ctx.letterSpacing`.
 *
 * That property is recent and unevenly implemented, and this runs on whatever
 * the phone happens to ship. Measuring per character costs nothing at this size
 * and makes the layout identical everywhere, which matters because the seam
 * position it produces is baked into the texture.
 */
function runWidth(ctx: CanvasRenderingContext2D, text: string, track: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + track;
  return text.length > 0 ? w - track : 0;
}

/** Draw a run character by character, honouring the same tracking as runWidth. */
function drawRun(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baseline: number,
  track: number
): void {
  let pen = x;
  for (const ch of text) {
    ctx.fillText(ch, pen, baseline);
    pen += ctx.measureText(ch).width + track;
  }
}

/**
 * Skew about the baseline so the word leans forward without drifting off it.
 *
 * transform(1, 0, -tan, 1, tan * baseline, 0) maps x to x - tan * (y - baseline):
 * the baseline itself is a fixed line and everything above it slides right in
 * proportion to its height. Skewing about the origin instead would translate the
 * whole word sideways by the height of the canvas, which is how this kind of
 * thing usually ends up mysteriously off-centre.
 */
function applySlant(ctx: CanvasRenderingContext2D, baseline: number): void {
  ctx.setTransform(1, 0, -Math.tan(SLANT_RADIANS), 1, Math.tan(SLANT_RADIANS) * baseline, 0);
}

const cache = new Map<string, WordmarkSdf>();

function cacheKey(spec: WordmarkSpec): string {
  return [
    spec.head,
    spec.tail,
    spec.suffix ?? '',
    spec.kicker ?? '',
    spec.family,
    spec.tracking ?? 0
  ].join(' ');
}

/**
 * Rasterise and distance-transform the wordmark. Cached per spec, so flipping
 * between faces with the ?face= parameter only pays for each one once.
 *
 * The caller is responsible for having loaded the font first — see
 * `loadWordmarkFont`. Drawing into a canvas with an unloaded family silently
 * substitutes a fallback and bakes it into the texture for the session.
 */
export function buildWordmarkSdf(spec: WordmarkSpec): WordmarkSdf {
  const hit = cache.get(cacheKey(spec));
  if (hit) return hit;

  const started = performance.now();

  // Laid out at a nominal size, then scaled once so the result lands inside the
  // texture budget. Measuring first and sizing the canvas to the answer avoids
  // both a cropped word and a mostly-empty texture.
  const NOMINAL = 200;
  const track = (spec.tracking ?? 0.01) * NOMINAL;
  const suffixSize = NOMINAL * 0.3;
  const kickerSize = NOMINAL * 0.088;
  const kickerTrack = kickerSize * 0.62;
  const suffixGap = NOMINAL * 0.075;
  const kickerGap = NOMINAL * 0.3;

  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d');
  if (!pctx) throw new Error('2D canvas unavailable for SDF rasterisation');

  pctx.font = `400 ${NOMINAL}px ${spec.family}`;
  const headW = runWidth(pctx, spec.head, track);
  const tailW = runWidth(pctx, spec.tail, track);

  pctx.font = `400 ${suffixSize}px ${spec.family}`;
  const suffixW = spec.suffix ? runWidth(pctx, spec.suffix, suffixSize * 0.16) : 0;

  pctx.font = `400 ${kickerSize}px ${spec.family}`;
  const kickerW = spec.kicker ? runWidth(pctx, spec.kicker, kickerTrack) : 0;

  const mainW = headW + tailW + (spec.suffix ? suffixGap + suffixW : 0);
  const capHeight = NOMINAL * 0.76;
  const radiusNominal = NOMINAL * SDF_RADIUS_RATIO;

  // Padding has to clear the widest thing that reaches outside the glyphs: the
  // field radius (bloom), the slant overhang, and the extrude the shader throws
  // down-right. Too little here and the bloom is sliced off square at the
  // texture edge, which is instantly visible.
  const slantOverhang = Math.tan(SLANT_RADIANS) * capHeight;
  const pad = radiusNominal * 1.9 + slantOverhang;

  const kickerBlock = spec.kicker ? kickerSize + kickerGap : 0;
  const layoutW = mainW + slantOverhang + pad * 2;
  const layoutH = capHeight + kickerBlock + pad * 2;

  // One uniform scale for the whole layout, so the ratio between the word, the
  // kicker and the field radius survives the fit.
  const scale = Math.min(1, MAX_TEXTURE_WIDTH / layoutW);
  const width = Math.max(2, Math.round(layoutW * scale));
  const height = Math.max(2, Math.round(layoutH * scale));
  const fontSize = NOMINAL * scale;
  const radius = radiusNominal * scale;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable for SDF rasterisation');

  const baseline = (pad + kickerBlock + capHeight) * scale;
  const startX = pad * scale;

  const draw = (fn: () => void): Layer => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    fn();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return readLayer(ctx, width, height);
  };

  const sTrack = track * scale;
  const headLayer = draw(() => {
    applySlant(ctx, baseline);
    ctx.font = `400 ${fontSize}px ${spec.family}`;
    drawRun(ctx, spec.head, startX, baseline, sTrack);
  });

  const tailX = startX + headW * scale;
  const tailLayer = draw(() => {
    applySlant(ctx, baseline);
    ctx.font = `400 ${fontSize}px ${spec.family}`;
    drawRun(ctx, spec.tail, tailX, baseline, sTrack);
  });

  const suffixLayer = draw(() => {
    if (!spec.suffix) return;
    applySlant(ctx, baseline);
    const size = suffixSize * scale;
    ctx.font = `400 ${size}px ${spec.family}`;
    drawRun(
      ctx,
      spec.suffix,
      tailX + (tailW + suffixGap) * scale,
      baseline,
      size * 0.16
    );
  });

  // The kicker is set flat. It sits above a slanted word, and slanting a line of
  // 8px letterspaced caps to match only makes it harder to read at phone size
  // without making the pair look any more deliberate.
  const kickerLayer = draw(() => {
    if (!spec.kicker) return;
    const size = kickerSize * scale;
    ctx.font = `400 ${size}px ${spec.family}`;
    // Centred over the main word rather than over the canvas, so the padding
    // that exists for the bloom does not drag it off-axis.
    const x = startX + (mainW * scale - kickerW * scale) * 0.5;
    drawRun(ctx, spec.kicker, x, (pad + kickerSize) * scale, kickerTrack * scale);
  });

  const data = new Uint8Array(width * height * 4);
  writeChannel(headLayer, data, width, height, 0, radius);
  writeChannel(tailLayer, data, width, height, 1, radius);
  writeChannel(suffixLayer, data, width, height, 2, radius);
  writeChannel(kickerLayer, data, width, height, 3, radius);

  const result: WordmarkSdf = {
    data,
    width,
    height,
    bandTop: ((pad + kickerBlock) * scale) / height,
    bandBottom: baseline / height,
    seamU: (startX + headW * scale) / width,
    buildMs: performance.now() - started
  };

  cache.set(cacheKey(spec), result);
  return result;
}

/**
 * Wait for a display face to be usable for rasterisation.
 *
 * `document.fonts.load` resolves as soon as the face is available, which is what
 * we need — `document.fonts.ready` waits on every font on the page and would
 * hold the title card behind unrelated work. Failure is not fatal: the SDF gets
 * built from whatever the browser substitutes, which is a worse-looking title
 * card rather than no title card.
 */
export async function loadWordmarkFont(family: string): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return false;
  try {
    await document.fonts.load(`400 200px ${family}`, 'ABEGMOPRSTXZ');
    return document.fonts.check(`400 200px ${family}`);
  } catch {
    return false;
  }
}
