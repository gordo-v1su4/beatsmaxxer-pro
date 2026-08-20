import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('hosted analysis failure safety', () => {
  test('realtime fallback never starts or probes audible playback', async () => {
    const source = await readFile('src/lib/audio/AudioEngine.ts', 'utf8');
    const fallback = source.slice(
      source.indexOf('private applyRealtimeFallback'),
      source.indexOf('\n  }\n}', source.indexOf('private applyRealtimeFallback'))
    );

    expect(fallback).toContain('this._analysisStatus = "fallback"');
    expect(fallback).not.toContain('.play(');
    expect(fallback).not.toContain('this.start(');
    expect(fallback).not.toContain('_playing = true');
  });
});
