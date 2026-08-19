import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { validateRedlineManifest } from '../../../scripts/validate-redline-media';
import { GET, _resolveQaMediaRequestPath } from '../../../src/routes/qa-media/[...path]/+server';

const MANIFEST_PATH = path.resolve('tests', 'fixtures', 'media', 'manifest.json');

describe('authoritative Redline QA media', () => {
  test('inventories and validates the complete read-only bundle', async () => {
    const { manifest, assetCount } = await validateRedlineManifest();
    expect(manifest.clips).toHaveLength(13);
    expect(manifest.audios).toHaveLength(2);
    expect(manifest.stems).toHaveLength(9);
    expect(manifest.midis).toHaveLength(7);
    expect(assetCount).toBe(31);
  });

  test('keeps every manifest asset on the explicit redline route', async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Record<string, unknown>;
    const assets = ['clips', 'audios', 'stems', 'midis']
      .flatMap((key) => manifest[key] as string[]);
    expect(assets.every((asset) => asset.startsWith('redline/'))).toBe(true);
    expect(assets.every((asset) => _resolveQaMediaRequestPath(asset) !== null)).toBe(true);
  });

  test('serves a contained MIDI fixture with the correct content type', async () => {
    const response = await GET({
      params: {
        path: 'redline/Redline (Remastered) Stems/Redline (Remastered) (Drums).mid'
      }
    } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/midi');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  test('rejects traversal instead of normalizing it into a fixture path', async () => {
    expect(_resolveQaMediaRequestPath('redline/../../package.json')).toBeNull();
    const response = await GET({ params: { path: 'redline/../../package.json' } } as never);
    expect(response.status).toBe(403);
  });

  test('fails validation immediately when an inventoried asset is missing', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'beatsmaxxer-redline-manifest-'));
    const tempManifest = path.join(tempDir, 'manifest.json');
    try {
      const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as {
        clips: string[];
      };
      manifest.clips[0] = 'redline/videos/missing.mp4';
      await writeFile(tempManifest, JSON.stringify(manifest));
      await expect(validateRedlineManifest(tempManifest)).rejects.toThrow();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
