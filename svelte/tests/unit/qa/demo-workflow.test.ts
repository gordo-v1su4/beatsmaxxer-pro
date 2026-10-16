import { afterEach, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { get } from 'svelte/store';
import { loadCompleteDemo } from '$lib/runtime/demoWorkflow';
import { audioEngine } from '$lib/audio';
import { arrangement } from '$lib/stores/arrangement';
import { moduleParams } from '$lib/stores/rack';
import * as manifestParser from '$lib/runtime/demoManifest';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
test('a demo workflow with the wrong decoded song duration preserves the current take', async () => {
  vi.spyOn(manifestParser, 'parsePublishedDemoManifest').mockImplementation(manifestParser.parseDemoManifest);
  const files = new Map<string, string>();
  const asset = (name: string, bytes: string, ext: string) => {
    const sha256 = createHash('sha256').update(bytes).digest('hex'), path = `/demo-media/${sha256}.${ext}`;
    files.set(path, bytes);
    return { name, path, sha256, size: Buffer.byteLength(bytes), type: 'application/octet-stream' };
  };
  const song = asset('redline.mp3', 'song bytes', 'mp3');
  const json = JSON.stringify({ sourceSha256: song.sha256 });
  const manifest = { version: 1, id: 'redline-complete-v1', title: 'Demo', song,
    analysis: asset('analysis.json', json, 'json'), midi: asset('midi.json', json, 'json'), structure: asset('structure.json', json, 'json'),
    clips: Array.from({ length: 10 }, (_, i) => asset(`clip ${i}.mp4`, `clip ${i}`, 'mp4')) };
  vi.stubGlobal('fetch', vi.fn(async (path: string) => new Response(path === '/demo-media/manifest.json' ? JSON.stringify(manifest) : files.get(path))));
  vi.stubGlobal('OfflineAudioContext', class { async decodeAudioData() { return { duration: 183 }; } });
  const load = vi.spyOn(audioEngine, 'loadAudioFile'), before = get(arrangement), params = get(moduleParams);
  await expect(loadCompleteDemo('perform', { name: song.name, duration: 30 })).rejects.toThrow('Workflow demo song does not match');
  expect(get(arrangement)).toBe(before); expect(get(moduleParams)).toBe(params); expect(load).not.toHaveBeenCalled();
});
