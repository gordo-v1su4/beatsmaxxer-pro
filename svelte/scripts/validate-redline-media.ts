import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export interface RedlineQaManifest {
  bundle: string;
  sourceRoot: string;
  clips: string[];
  audio: string;
  audios: string[];
  stems: string[];
  midi: string;
  midis: string[];
}

const EXPECTED_COUNTS = {
  clips: 13,
  audios: 2,
  stems: 9,
  midis: 7
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isContained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function assertUnique(label: string, values: string[], count: number) {
  assert(values.length === count, `${label} must contain ${count} entries; found ${values.length}`);
  assert(new Set(values).size === values.length, `${label} contains duplicate entries`);
}

export async function validateRedlineManifest(
  manifestPath = path.resolve('tests', 'fixtures', 'media', 'manifest.json'),
  repoRoot = path.resolve('..')
) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as RedlineQaManifest;
  assert(manifest.bundle === 'redline-media', 'manifest.bundle must be redline-media');
  assert(manifest.sourceRoot === 'test_media', 'manifest.sourceRoot is not authoritative');
  assertUnique('clips', manifest.clips, EXPECTED_COUNTS.clips);
  assertUnique('audios', manifest.audios, EXPECTED_COUNTS.audios);
  assertUnique('stems', manifest.stems, EXPECTED_COUNTS.stems);
  assertUnique('midis', manifest.midis, EXPECTED_COUNTS.midis);
  assert(manifest.audios.includes(manifest.audio), 'primary audio must be present in audios');
  assert(manifest.midis.includes(manifest.midi), 'primary MIDI must be present in midis');

  const sourceRoot = await realpath(path.resolve(repoRoot, manifest.sourceRoot));
  const inventory = [...manifest.clips, ...manifest.audios, ...manifest.stems, ...manifest.midis];
  for (const asset of inventory) {
    assert(asset.startsWith('redline/'), `asset is outside the redline virtual root: ${asset}`);
    const candidate = await realpath(path.resolve(sourceRoot, asset.slice('redline/'.length)));
    assert(isContained(sourceRoot, candidate), `asset escapes the source bundle: ${asset}`);
    assert((await stat(candidate)).isFile(), `asset is not a file: ${asset}`);
  }

  return { manifest, sourceRoot, assetCount: inventory.length };
}

if (import.meta.main) {
  try {
    const result = await validateRedlineManifest();
    console.log(
      `Validated ${result.assetCount} Redline assets: ` +
      `${result.manifest.clips.length} clips, ${result.manifest.audios.length} mixes, ` +
      `${result.manifest.stems.length} WAV stems, ${result.manifest.midis.length} MIDI stems`
    );
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
