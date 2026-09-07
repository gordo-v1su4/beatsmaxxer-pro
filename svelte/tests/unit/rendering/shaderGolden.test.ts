import { describe, expect, test } from 'vitest';
import {
  MODULE_FX_IDLE_WGSL,
  MODULE_FX_WGSL,
  SHADER_EFFECT_MODE
} from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';

describe('shader golden baselines', () => {
  test('MODULE_FX_WGSL assembly is stable', () => {
    expect(MODULE_FX_WGSL).toMatchSnapshot();
  });

  test('MODULE_FX_IDLE_WGSL assembly is stable', () => {
    expect(MODULE_FX_IDLE_WGSL).toMatchSnapshot();
  });

  test('SHADER_EFFECT_MODE key order is stable', () => {
    expect(SHADER_EFFECT_MODE).toMatchSnapshot();
  });
});
