import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_RACK_BOTTOM,
  DEFAULT_RACK_TOP,
  listCatalog,
  listByCategory
} from '$lib/modules/catalog';
import {
  BRIEF_IDENTITY_COUNT_LEGACY,
  EXPECTED_PALETTE_SWAP_IDENTITIES,
  LIVE_IDENTITY_COUNT,
  MODULE_CONTROL_CONTRACTS,
  RETIRED_IDENTITIES,
  defaultRackIdentities,
  gpuUniformsForModule,
  paletteSwapIdentities
} from '$lib/modules/controlContracts';
import { MODULE_PRESETS } from '$lib/modules/presets';
import { MIDI_TIMING_CONTRACTS } from '$lib/modules/midiContracts';
import { COMPACT_CONTROLS, MOBILE_SPECS, PLUMBING_PARAMS } from '$lib/mobile/moduleControlSpecs';
import { computeSpeedRampRate } from '$lib/runtime/speedramp';
import { moduleSemanticOraclesV1, MODULE_SEMANTIC_ORACLES_VERSION } from '$lib/qa/moduleSemanticOracles';

const RETIRED_KEYS = new Set(['in_', 'out']);

function surfaceParamKeys(id: string): Set<string> {
  const keys = new Set<string>();
  const compact = COMPACT_CONTROLS[id];
  if (compact) {
    keys.add(compact.primary);
    for (const slider of compact.sliders) keys.add(slider.param);
    if (compact.toggle) keys.add(compact.toggle.param);
    for (const button of compact.buttons) {
      for (const key of Object.keys(button.set)) keys.add(key);
    }
  }
  const mobile = MOBILE_SPECS[id];
  if (mobile) {
    for (const slider of mobile.sliders) keys.add(slider.param);
    for (const toggle of mobile.toggles ?? []) keys.add(toggle.param);
    for (const action of mobile.actions ?? []) keys.add(action.param);
    for (const group of mobile.groups) {
      keys.add(group.primary);
      for (const key of group.matchKeys ?? []) keys.add(key);
      for (const button of group.buttons) {
        for (const key of Object.keys(button.set)) keys.add(key);
      }
    }
  }
  return keys;
}

describe('G002 control contracts', () => {
  test('locks 19 live identities against the stale 18-count brief', () => {
    const ids = listCatalog().map((module) => module.id);
    expect(ids).toHaveLength(LIVE_IDENTITY_COUNT);
    expect(BRIEF_IDENTITY_COUNT_LEGACY).toBe(18);
    expect([...RETIRED_IDENTITIES]).toEqual(['camcorder']);
    expect(ids).not.toContain('camcorder');
    expect(Object.keys(MODULE_CONTROL_CONTRACTS).sort()).toEqual([...ids].sort());
  });

  test('default rack plus palette swaps cover every identity exactly once', () => {
    const held = defaultRackIdentities();
    const swaps = paletteSwapIdentities();
    expect(held).toEqual([...DEFAULT_RACK_TOP, ...DEFAULT_RACK_BOTTOM]);
    expect(swaps.sort()).toEqual([...EXPECTED_PALETTE_SWAP_IDENTITIES].sort());
    expect(new Set([...held, ...swaps]).size).toBe(LIVE_IDENTITY_COUNT);
    expect(held).toHaveLength(10);
    expect(swaps).toHaveLength(9);
  });

  test('FX palette lists every swap identity by category', () => {
    const listed = ['beat', 'camera', 'film'].flatMap((category) =>
      listByCategory(category as 'beat' | 'camera' | 'film').map((module) => module.id)
    );
    expect(listed.sort()).toEqual(listCatalog().map((module) => module.id).sort());
    for (const id of EXPECTED_PALETTE_SWAP_IDENTITIES) {
      expect(listed).toContain(id);
    }
  });

  test.each(listCatalog().map((module) => [module.id, module] as const))(
    '%s maps every catalog and surface param to a live consumer',
    (id, module) => {
      const contract = MODULE_CONTROL_CONTRACTS[id];
      const catalogKeys = Object.keys(module.params);
      expect(catalogKeys.some((key) => RETIRED_KEYS.has(key))).toBe(false);

      for (const key of catalogKeys) {
        const spec = contract.params[key];
        expect(spec, `${id}.${key} missing from contract`).toBeTruthy();
        expect(spec.consumers.length).toBeGreaterThan(0);
      }

      for (const key of surfaceParamKeys(id)) {
        const spec = contract.params[key];
        expect(spec, `${id} surface control ${key} has no consumer`).toBeTruthy();
        expect(spec.consumers.length).toBeGreaterThan(0);
      }

      for (const [key, spec] of Object.entries(contract.params)) {
        if (key === 'density') {
          expect(MIDI_TIMING_CONTRACTS[id as keyof typeof MIDI_TIMING_CONTRACTS].density).toBe(true);
          expect(spec.consumers).toContain('midi');
          continue;
        }
        expect(catalogKeys, `${id} contract orphan ${key}`).toContain(key);
      }
    }
  );

  test('retired IN/OUT keys are gone from mix plumbing, presets, and mix strip', async () => {
    expect([...PLUMBING_PARAMS]).toEqual(['mix']);
    for (const presets of Object.values(MODULE_PRESETS)) {
      for (const preset of presets) {
        expect(Object.keys(preset.set).some((key) => RETIRED_KEYS.has(key))).toBe(false);
      }
    }
    const mix = await readFile('src/lib/components/rack/MixSection.svelte', 'utf8');
    expect(mix).toContain('label="MIX"');
    expect(mix).not.toContain('label="IN"');
    expect(mix).not.toContain("onUpdate('in_'");
  });

  test('palette cards expose module ids for swap targeting', async () => {
    const palette = await readFile('src/lib/components/ModulePalette.svelte', 'utf8');
    expect(palette).toContain('listByCategory(cat.key)');
    expect(palette).toContain('data-module-id={mod.id}');
  });

  test('gpuUniformsForModule fail-closes unknown identities instead of inventing slots', () => {
    expect(gpuUniformsForModule('camcorder', { mix: 80, amount: 99, tracking: 40 })).toEqual({
      mix: 80
    });
  });

  test.each(listCatalog().map((module) => [module.id, module] as const))(
    '%s gpu-mapped params change a uniform when bumped',
    (id, module) => {
      const contract = MODULE_CONTROL_CONTRACTS[id];
      const defaults = { ...module.params };
      const base = gpuUniformsForModule(id, defaults);
      for (const [key, spec] of Object.entries(contract.params)) {
        if (!spec.consumers.includes('gpu') || spec.gpuSlot == null) continue;
        if (id === 'speedramp' && (spec.gpuSlot === 'aux1' || spec.gpuSlot === 'aux2')) continue;
        if (id === 'timesampler' && (spec.gpuSlot === 'aux1' || spec.gpuSlot === 'aux2' || spec.gpuSlot === 'accent')) {
          continue;
        }
        const bumped = {
          ...defaults,
          [key]: defaults[key] === 0 ? 100 : 0
        };
        const next = gpuUniformsForModule(id, bumped);
        expect(next, `${id}.${key} → ${spec.gpuSlot}`).not.toEqual(base);
      }
    }
  );

  test('SPEEDRAMP bezier params steer the runtime rate, not a GPU slot', () => {
    const dip = computeSpeedRampRate(2, {
      len: 36,
      spdMin: 25,
      spdMax: 75,
      bzY0: 100,
      bzY1: 0,
      bzY2: 0,
      bzY3: 100
    });
    const flat = computeSpeedRampRate(2, {
      len: 36,
      spdMin: 25,
      spdMax: 75,
      bzY0: 50,
      bzY1: 50,
      bzY2: 50,
      bzY3: 50
    });
    expect(dip).not.toBeCloseTo(flat, 2);
    const uniforms = gpuUniformsForModule('speedramp', {
      mix: 100, spdMin: 25, spdMax: 75, len: 36, bzY0: 0
    });
    expect(uniforms.p0).toBe(75);
    expect(uniforms.p1).toBe(25);
    expect(uniforms.p2).toBe(36);
  });
});

describe('module-semantic-oracles.v1', () => {
  test('records inventory, not a placeholder identity count', () => {
    const oracles = moduleSemanticOraclesV1();
    expect(oracles.version).toBe(MODULE_SEMANTIC_ORACLES_VERSION);
    expect(oracles.liveIdentityCount).toBe(19);
    expect(oracles.briefIdentityCountLegacy).toBe(18);
    expect(oracles.retiredIdentities).toEqual(['camcorder']);
    expect(oracles.paletteSwapIdentities.sort()).toEqual(
      [...EXPECTED_PALETTE_SWAP_IDENTITIES].sort()
    );
    expect(Object.keys(oracles.modules)).toHaveLength(19);
    expect(oracles.modules.transition.params.trig.consumers).toContain('event');
    expect(oracles.modules.transition.params.mix.consumers).toContain('gpu');
  });
});
