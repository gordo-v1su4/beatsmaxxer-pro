import { expect, test } from 'vitest';
import { parseDemoManifest } from '$lib/runtime/demoManifest';

const sha256 = 'a'.repeat(64);
const asset = (name: string, ext = 'mp4') => ({ name, sha256, size: 10, type: 'video/mp4', path: `/demo-media/${sha256}.${ext}` });
const manifest = () => ({ version: 1, id: 'redline-complete-v1', title: 'Demo', song: asset('song', 'mp3'), analysis: asset('analysis', 'json'), midi: asset('midi', 'json'), structure: asset('structure', 'json'), clips: Array.from({ length: 10 }, (_, i) => asset(`clip-${i}`)) });

test('accepts a complete same-origin content-addressed bundle', () => {
  expect(parseDemoManifest(manifest()).clips).toHaveLength(10);
});
test('rejects incomplete bundles, off-origin paths, duplicate clip identities and digest/path mismatch', () => {
  const short = manifest(); short.clips.pop(); expect(() => parseDemoManifest(short)).toThrow();
  const remote = manifest(); remote.song.path = 'https://other.example/song.mp3'; expect(() => parseDemoManifest(remote)).toThrow();
  const mismatch = manifest(); mismatch.song.sha256 = 'b'.repeat(64); expect(() => parseDemoManifest(mismatch)).toThrow();
  const duplicate = manifest(); duplicate.clips[1].name = duplicate.clips[0].name; expect(() => parseDemoManifest(duplicate)).toThrow();
});
