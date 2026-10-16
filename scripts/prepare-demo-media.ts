import { mkdir, copyFile, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname, relative, sep } from 'node:path';
import type { DemoAsset, DemoManifest } from '../svelte/src/lib/runtime/demoManifest';

// Packaging only: reuse original files and cached analysis; no media processing.
const benchmark = resolve(process.argv[2] ?? 'svelte/.artifacts/benchmark-fixtures/benchmark');
const qa = resolve(process.argv[3] ?? 'test_media');
const output = resolve(process.argv[4] ?? 'svelte/.artifacts/demo-media');
await mkdir(output, { recursive: true });
async function asset(source: string, name: string): Promise<DemoAsset> {
  const bytes = await readFile(source), sha256 = createHash('sha256').update(bytes).digest('hex');
  const filename = sha256 + extname(source).toLowerCase();
  const destination = resolve(output, filename);
  if (!(await stat(destination).catch(() => null)) || createHash('sha256').update(await readFile(destination)).digest('hex') !== sha256) await copyFile(source, destination);
  return { name, path: `/demo-media/${filename}`, sha256, size: bytes.length,
    type: ({ '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.json': 'application/json' } as Record<string, string>)[extname(source)]! };
}
const [song, analysis, midi, structure] = await Promise.all(['redline.mp3', 'redline-analysis.json', 'redline-midi.json', 'redline-studio.json'].map(name => asset(resolve(benchmark, name), name)));
for (const filename of ['redline-analysis.json', 'redline-midi.json']) {
  const data = JSON.parse(await readFile(resolve(benchmark, filename), 'utf8'));
  if (data.sourceSha256 !== song.sha256) throw new Error(`${filename} does not match the demo song`);
}
const clips: DemoAsset[] = [];
const qaManifest = JSON.parse(await readFile('svelte/tests/fixtures/media/manifest.json', 'utf8'));
for (let i = 0; i < 10; i++) {
  const source = resolve(qa, String(qaManifest.clips[i]).replace(/^redline\//, ''));
  const suffix = relative(qa, source);
  if (!suffix || suffix.startsWith('..' + sep) || suffix === '..') throw new Error('Invalid QA source path');
  clips.push(await asset(source, `Redline clip ${String(i + 1).padStart(2, '0')}.mp4`));
}
const manifest: DemoManifest = { version: 1, id: 'redline-complete-v1', title: 'Redline · Complete Demo', song, analysis, midi, structure, clips };
// Commit the catalog last: incomplete packaging never advertises a ready bundle.
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.info(`Demo bundle ready: ${clips.length} original clips, matching song/MIDI/analysis; ${output}`);
