import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const app = resolve(import.meta.dir, '..');
const source = resolve(process.argv[2] ?? resolve(app, '../../zig-swap'));
const fixtureRoot = resolve(source, 'prep/fixtures/test-media');
const destination = resolve(app, '.artifacts/benchmark-fixtures');
const prefix = '/fixtures/test-media/';
const outputPrefix = '/benchmark-fixtures/';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const imported = new Map<string, string>();

async function copy(url: string, expectedHash?: string) {
  if (!url.startsWith(prefix)) throw new Error(`Unexpected fixture URL: ${url}`);
  const sourcePath = resolve(fixtureRoot, url.slice(prefix.length));
  const suffix = relative(fixtureRoot, sourcePath);
  if (!suffix || suffix.startsWith(`..${sep}`) || suffix === '..') throw new Error('Fixture escapes source root');
  const bytes = await readFile(sourcePath);
  const digest = hash(bytes);
  if (expectedHash && digest !== expectedHash) throw new Error(`Fixture hash mismatch: ${suffix}`);
  const target = resolve(destination, suffix);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(sourcePath, target);
  imported.set(url, digest);
}
async function json(name: string) {
  return JSON.parse(await readFile(resolve(fixtureRoot, 'benchmark', name), 'utf8'));
}
const manifest = await json('manifest.json');
for (const clip of manifest.clips) {
  for (const variant of Object.values(clip.variants) as {url:string;sha256:string}[]) {
    await copy(variant.url, variant.sha256);
  }
}
await copy(manifest.audio.url, manifest.audio.sha256);
await copy(manifest.grid.url, manifest.grid.sha256);
const midi = await json('redline-midi.json');
const analysis = await json('redline-analysis.json');
if (analysis.sourceSha256 !== midi.sourceSha256) throw new Error('Analysis and MIDI reference different audio');
await copy(midi.sourceUrl, midi.sourceSha256);
const interpolation = await json('interpolation-manifest.json');
for (const clip of interpolation.clips) await copy(clip.variant.url, clip.variant.sha256);
for (const name of ['manifest.json', 'audio-events.json', 'redline-midi.json', 'redline-analysis.json', 'interpolation-manifest.json']) {
  const bytes = await readFile(resolve(fixtureRoot, 'benchmark', name));
  imported.set(`${prefix}benchmark/${name}`, hash(bytes));
  // Only manifest URL prefixes change. Media bytes and analyzed timestamps are preserved.
  await writeFile(resolve(destination, 'benchmark', name), bytes.toString().replaceAll(prefix, outputPrefix));
}
const provenance = {
  sourceRevision: execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding:'utf8' }).trim(),
  sourceDirty: Boolean(execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding:'utf8' }).trim()),
  importedAt: new Date().toISOString(),
  originalHashes: Object.fromEntries(imported),
  note: 'Controlled zig-swap H264 fixtures; selected RIFE banks; only URL prefixes rewritten. Original files unchanged.'
};
await writeFile(resolve(destination, 'provenance.json'), JSON.stringify(provenance, null, 2));
console.log(`Imported and verified ${imported.size} fixtures to ${destination}`);
