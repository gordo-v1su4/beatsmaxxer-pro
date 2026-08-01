import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export interface PngMetrics {
  width: number;
  height: number;
  contentHash: string;
  nonBlackPixelRatio: number;
  sampledRgb: Uint8Array;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function parsePngMetrics(bytes: Uint8Array): PngMetrics {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8, dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error('truncated PNG chunk');
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8]!;
      colorType = buffer[dataStart + 9]!;
    } else if (type === 'IDAT') idat.push(buffer.subarray(dataStart, dataEnd));
    else if (type === 'IEND') break;
    offset = dataEnd + 4;
  }
  if (width < 1 || height < 1 || bitDepth !== 8 || ![2, 6].includes(colorType) || idat.length === 0) {
    throw new Error('unsupported PNG format');
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error('invalid PNG scanline length');
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + x + 1]!;
      const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels]! : 0;
      const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : NaN;
      if (!Number.isFinite(prediction)) throw new Error(`unsupported PNG filter ${filter}`);
      pixels[y * stride + x] = (value + prediction) & 0xff;
    }
  }
  const sampled: number[] = [];
  let nonBlack = 0, hash = 0x811c9dc5;
  for (let pixel = 0; pixel < width * height; pixel += 16) {
    const index = pixel * channels;
    const rgb = [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!];
    sampled.push(...rgb);
    if (rgb[0] + rgb[1] + rgb[2] > 18) nonBlack++;
    for (const channel of rgb) { hash ^= channel; hash = Math.imul(hash, 0x01000193); }
  }
  return {
    width, height,
    contentHash: (hash >>> 0).toString(16),
    nonBlackPixelRatio: sampled.length ? nonBlack / (sampled.length / 3) : 0,
    sampledRgb: Uint8Array.from(sampled)
  };
}

export function pixelDifferenceRatio(a: PngMetrics, b: PngMetrics) {
  if (a.width !== b.width || a.height !== b.height || a.sampledRgb.length !== b.sampledRgb.length) return 1;
  let changed = 0;
  for (let i = 0; i < a.sampledRgb.length; i += 3) {
    if (a.sampledRgb[i] !== b.sampledRgb[i] || a.sampledRgb[i + 1] !== b.sampledRgb[i + 1] || a.sampledRgb[i + 2] !== b.sampledRgb[i + 2]) changed++;
  }
  return changed / (a.sampledRgb.length / 3);
}

async function digestPaths(roots: string[], root: string) {
  const hasher = createHash('sha256');
  const files: string[] = [];
  async function collect(path: string) {
    const info = await stat(path);
    if (info.isDirectory()) {
      for (const entry of await readdir(path)) await collect(resolve(path, entry));
    } else files.push(path);
  }
  for (const path of roots) await collect(resolve(root, path));
  for (const path of files.sort()) {
    hasher.update(relative(root, path).split(sep).join('/'));
    hasher.update(await readFile(path));
  }
  return hasher.digest('hex');
}

export function computeVisualProofSourceDigest(root = process.cwd()) {
  return digestPaths(['src', 'scripts', 'package.json', 'vite.config.ts', 'svelte.config.js'], root);
}

export function computeVisualProofBuildDigest(root = process.cwd()) {
  return digestPaths(['build'], root);
}

export function digestJson(value: unknown) {
  const hasher = createHash('sha256');
  hasher.update(JSON.stringify(value));
  return hasher.digest('hex');
}

export async function fixtureFileMetadata(names: string[], root = process.cwd()) {
  return Promise.all(names.map(async (name) => {
    const bytes = await readFile(resolve(root, 'tests/fixtures/media', name));
    const hasher = createHash('sha256');
    hasher.update(bytes);
    return { name, size: bytes.byteLength, sha256: hasher.digest('hex') };
  }));
}

export interface RealMediaFileMetadata {
  relativePath: string;
  name: string;
  kind: 'audio' | 'video';
  size: number;
  sha256: string;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  codecs: string[];
  formatName: string;
}

function ffprobe(path: string): Promise<Record<string, any>> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('ffprobe', [
      '-v', 'error', '-show_entries',
      'format=duration,format_name:stream=codec_type,codec_name,width,height:stream_disposition=attached_pic',
      '-of', 'json', path
    ]);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed for ${path}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(Buffer.concat(stdout).toString('utf8')) as Record<string, any>);
      } catch (error) {
        reject(new Error(`invalid ffprobe JSON for ${path}: ${String(error)}`));
      }
    });
  });
}

/** Hashes and probes the immutable, repo-local media used by the headed proof. */
export async function realMediaFileMetadata(relativePaths: string[], root = process.cwd()): Promise<RealMediaFileMetadata[]> {
  return Promise.all(relativePaths.map(async (relativePath) => {
    const absolutePath = resolve(root, relativePath);
    const [bytes, probe] = await Promise.all([readFile(absolutePath), ffprobe(absolutePath)]);
    const streams = Array.isArray(probe.streams) ? probe.streams as Array<Record<string, unknown>> : [];
    const video = streams.find((stream) =>
      stream.codec_type === 'video' && (stream.disposition as Record<string, unknown> | undefined)?.attached_pic !== 1
    );
    const durationSeconds = Number((probe.format as Record<string, unknown> | undefined)?.duration);
    if (!(durationSeconds > 0) || streams.length === 0) throw new Error(`media metadata is incomplete: ${relativePath}`);
    const hasher = createHash('sha256');
    hasher.update(bytes);
    return {
      relativePath: relativePath.split(sep).join('/'),
      name: relativePath.split(/[\\/]/).at(-1)!,
      kind: video ? 'video' as const : 'audio' as const,
      size: bytes.byteLength,
      sha256: hasher.digest('hex'),
      durationSeconds,
      width: video ? Number(video.width) : null,
      height: video ? Number(video.height) : null,
      codecs: streams.map((stream) => String(stream.codec_name ?? '')).filter(Boolean).sort(),
      formatName: String((probe.format as Record<string, unknown> | undefined)?.format_name ?? '')
    };
  }));
}
