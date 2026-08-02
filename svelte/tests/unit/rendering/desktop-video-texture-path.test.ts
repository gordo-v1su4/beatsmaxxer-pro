import { describe, expect, test } from 'vitest';
import { shouldUsePersistentVideoTexture } from '$lib/rendering/webgpu/WebGpuEngine';

describe('desktop video texture path', () => {
  test('uses persistent GPU textures for every Tauri module', () => {
    expect(shouldUsePersistentVideoTexture('transition', true)).toBe(true);
    expect(shouldUsePersistentVideoTexture('speedramp', true)).toBe(true);
  });

  test('keeps normal web modules on external textures', () => {
    expect(shouldUsePersistentVideoTexture('transition', false)).toBe(false);
    expect(shouldUsePersistentVideoTexture('speedramp', false)).toBe(false);
  });

  test('retains the persistent timesampler texture on web', () => {
    expect(shouldUsePersistentVideoTexture('timesampler', false)).toBe(true);
  });
});
