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

// camcorder merged into the unified vhs tape shader (mode 16 retired); the
// remaining mode numbers stay stable for native-compositor parity.
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
  'prism',
  'streak',
  'mirror',
  'lens'
] as const;

const EXPECTED_EFFECT_MODES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20];

describe('module shader identity contract', () => {
  test('locks the 19 advertised catalog entries', () => {
    expect(catalogIds()).toEqual(EXPECTED_MODULE_IDS);
    expect(MODULE_CATALOG.size).toBe(19);
  });

  test('provides sequentially numbered named presets for every advertised module', () => {
    expect(Object.keys(MODULE_PRESETS).sort()).toEqual([...EXPECTED_MODULE_IDS].sort());

    for (const id of EXPECTED_MODULE_IDS) {
      const presets = MODULE_PRESETS[id];
      expect(presets.length, `${id} presets`).toBeGreaterThanOrEqual(3);
      expect(presets.map((preset) => preset.n)).toEqual(
        presets.map((_, index) => String(index + 1))
      );
      expect(presets.every((preset) => preset.title.length > 0)).toBe(true);
    }
  });

  test('assigns one explicit, unique effect mode per module', () => {
    expect(Object.keys(SHADER_EFFECT_MODE)).toEqual(EXPECTED_MODULE_IDS);
    expect(new Set(Object.values(SHADER_EFFECT_MODE)).size).toBe(EXPECTED_MODULE_IDS.length);
    expect(Object.values(SHADER_EFFECT_MODE).sort((a, b) => a - b)).toEqual(EXPECTED_EFFECT_MODES);
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
    const bodies: Array<[string, number]> = [
      ['Transition', 1], ['SpeedRamp', 2], ['TapDelay', 3], ['TimeSampler', 4],
      ['Punch', 5], ['Shake', 6], ['Drift', 7], ['Focus', 8], ['Anamorphic', 9],
      ['Grain', 10], ['Leak', 11], ['Dutch', 12], ['Halation', 13], ['Bulge', 14],
      ['Vhs', 15], ['Prism', 17], ['Streak', 18], ['Mirror', 19], ['Lens', 20]
    ];

    bodies.forEach(([body, mode]) => {
      expect(MODULE_FX_WGSL).toContain(`fn effect${body}(`);
      expect(MODULE_FX_WGSL).toContain(
        `mode == ${mode}.0) { wet = effect${body}(dry, uv); }`
      );
    });
  });

  test('new effect bodies consume each advertised primary parameter channel', () => {
    const bodies = [
      'Anamorphic', 'Grain', 'Leak', 'Dutch', 'Halation',
      'Bulge', 'Vhs', 'Prism', 'Streak', 'Mirror', 'Lens'
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

describe('uniform buffer capacity', () => {
  test('the Uniforms struct still fits the 160-byte buffer', () => {
    // encodeBinding writes a Float32Array(40) into a 160-byte buffer. A member
    // added past the end reads garbage rather than failing loudly, which is a
    // miserable bug to chase through a shader, so the count is asserted here.
    //
    // Grown from 32 words: aux3/aux4 carry LEAK's BLADES and SQUEEZE, and
    // onsetAmp/bassNorm/highAmp carry the audio drive. The guard is the
    // relationship, not the number -- the struct must fit the array, with the
    // spare words left as 16-byte alignment padding.
    const BUFFER_WORDS = 40;
    const struct = MODULE_FX_WGSL.slice(
      MODULE_FX_WGSL.indexOf('struct Uniforms {'),
      MODULE_FX_WGSL.indexOf('@group(0) @binding(0)')
    );
    const members = struct
      .split('\n')
      .filter((line) => /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*(f32|u32|i32),/.test(line));
    expect(members.length).toBe(37);
    expect(members.length).toBeLessThanOrEqual(BUFFER_WORDS);
  });
});
