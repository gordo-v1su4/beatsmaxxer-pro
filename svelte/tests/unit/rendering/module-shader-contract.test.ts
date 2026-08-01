import { describe, expect, test } from 'vitest';
import { MODULE_CATALOG, catalogIds } from '$lib/modules/catalog';
import { MODULE_PRESETS } from '$lib/modules/presets';
import {
  MODULE_FX_WGSL,
  SHADER_EFFECT_MODE
} from '$lib/rendering/webgpu/shaders/moduleFx.wgsl';
import {
  MODULE_SHADER_WGSL,
  getModuleShader
} from '$lib/rendering/webgpu/shaders/registry';

const EXPECTED_MODULE_IDS = [
  'transition',
  'speedramp',
  'tapdelay',
  'timesampler',
  'punch',
  'shake',
  'orbit',
  'focus',
  'anamorphic',
  'grain',
  'leak',
  'dutch',
  'halation',
  'bulge',
  'vhs',
  'camcorder',
  'prism',
  'streak'
] as const;

describe('module shader identity contract', () => {
  test('locks the 18 advertised catalog entries', () => {
    expect(catalogIds()).toEqual(EXPECTED_MODULE_IDS);
    expect(MODULE_CATALOG.size).toBe(18);
  });

  test('provides exactly three named presets for every advertised module', () => {
    expect(Object.keys(MODULE_PRESETS).sort()).toEqual([...EXPECTED_MODULE_IDS].sort());

    for (const id of EXPECTED_MODULE_IDS) {
      expect(MODULE_PRESETS[id], `${id} presets`).toHaveLength(3);
      expect(MODULE_PRESETS[id].map((preset) => preset.n)).toEqual(['1', '2', '3']);
      expect(MODULE_PRESETS[id].every((preset) => preset.title.length > 0)).toBe(true);
    }
  });

  test('assigns one explicit, unique effect mode per module', () => {
    expect(Object.keys(SHADER_EFFECT_MODE)).toEqual(EXPECTED_MODULE_IDS);
    expect(new Set(Object.values(SHADER_EFFECT_MODE)).size).toBe(18);
    expect(Object.values(SHADER_EFFECT_MODE).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1)
    );
  });

  test('has no catalog shader missing from either registry', () => {
    for (const module of MODULE_CATALOG.values()) {
      const shaderKey = module.shaderKey ?? module.id;
      expect(SHADER_EFFECT_MODE[shaderKey], `${module.id} effect mode`).toBeTypeOf('number');
      expect(MODULE_SHADER_WGSL[shaderKey], `${module.id} shader source`).toBe(MODULE_FX_WGSL);
      expect(getModuleShader(shaderKey)).toBe(MODULE_FX_WGSL);
    }
  });

  test('dispatches every unique mode to an explicit effect body', () => {
    const bodies = [
      'Transition', 'SpeedRamp', 'TapDelay', 'TimeSampler', 'Punch', 'Shake',
      'Drift', 'Focus', 'Anamorphic', 'Grain', 'Leak', 'Dutch', 'Halation',
      'Bulge', 'Vhs', 'Camcorder', 'Prism', 'Streak'
    ];

    bodies.forEach((body, index) => {
      expect(MODULE_FX_WGSL).toContain(`fn effect${body}(`);
      expect(MODULE_FX_WGSL).toContain(
        `mode == ${index + 1}.0) { wet = effect${body}(dry, uv); }`
      );
    });
  });

  test('new effect bodies consume each advertised primary parameter channel', () => {
    const bodies = [
      'Anamorphic', 'Grain', 'Leak', 'Dutch', 'Halation',
      'Bulge', 'Vhs', 'Camcorder', 'Prism', 'Streak'
    ];

    for (const body of bodies) {
      const source = MODULE_FX_WGSL.match(
        new RegExp(`fn effect${body}\\([^]*?\\n\\}`)
      )?.[0];
      expect(source, `${body} WGSL body`).toBeDefined();
      expect(source).toContain('u.p0');
      expect(source).toContain('u.p1');
      expect(source).toContain('u.p2');
    }
  });

  test('uses shared deterministic uniforms and clamps final output', () => {
    expect(MODULE_FX_WGSL).toContain('u.beat');
    expect(MODULE_FX_WGSL).toContain('u.beatPhase');
    for (const field of [
      'positionSeconds', 'audioFrameId', 'fixedStepSeconds', 'fixedStepIndex',
      'fixedStepPhase', 'playbackRate', 'generation', 'deterministicSeed'
    ]) {
      expect(MODULE_FX_WGSL).toContain(`${field}:`);
    }
    expect(MODULE_FX_WGSL).not.toMatch(/Date|performance|wallClock|renderCount|random\s*\(/);
    expect(MODULE_FX_WGSL).toContain(
      'return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), 1.0);'
    );
  });
});
