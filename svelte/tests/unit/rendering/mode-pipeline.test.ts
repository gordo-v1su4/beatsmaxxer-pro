import { describe, expect, test } from 'vitest';
import {
  moduleFxWgslForMode,
  SHADER_EFFECT_MODE,
  SHADER_EFFECT_MODES
} from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';

describe('per-mode FX shader specialisation', () => {
  test('bakes the mode in as a const in both places it is selected', () => {
    for (const variant of ['video', 'idle'] as const) {
      const src = moduleFxWgslForMode(11, variant);
      expect(src).not.toContain('floor(u.effectMode + 0.5)');
      expect(src.split('const mode = 11.0;').length).toBe(3);
    }
  });

  test('idle variant keeps its texture_2d binding', () => {
    expect(moduleFxWgslForMode(0, 'idle')).toContain('var videoTex: texture_2d<f32>;');
    expect(moduleFxWgslForMode(0, 'video')).toContain('var videoTex: texture_external;');
  });

  test('builds a pipeline for the dry mode and every catalog effect', () => {
    expect(SHADER_EFFECT_MODES[0]).toBe(0);
    for (const mode of Object.values(SHADER_EFFECT_MODE)) {
      expect(SHADER_EFFECT_MODES).toContain(mode);
    }
  });
});
