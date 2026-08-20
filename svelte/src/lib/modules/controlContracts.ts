/**
 * G002 control contracts.
 *
 * Every catalog param and every authored surface control names a live consumer.
 * There is no partial IN/OUT policy: MIX is wet/dry, and unused envelope keys
 * are retired rather than shown as inert knobs.
 *
 * Identity count: the catalog is the source of truth at **19** live modules.
 * The M1 brief said 18 because camcorder (shader mode 16) merged into VHS.
 * There is no 20th identity.
 */
import {
  DEFAULT_RACK_BOTTOM,
  DEFAULT_RACK_TOP,
  listCatalog,
  type ModuleDefinition
} from '$lib/modules/catalog';
import { MIDI_TIMING_CONTRACTS } from '$lib/modules/midiContracts';
import type { ModuleRenderParams } from '$lib/rendering/webgpu/WebGpuEngine';

export const LIVE_IDENTITY_COUNT = 19;
export const BRIEF_IDENTITY_COUNT_LEGACY = 18;
export const RETIRED_IDENTITIES = ['camcorder'] as const;

/** Extra identities the default rack does not hold — one drag from the FX rail. */
export const EXPECTED_PALETTE_SWAP_IDENTITIES = [
  'streak',
  'focus',
  'anamorphic',
  'grain',
  'dutch',
  'halation',
  'bulge',
  'vhs',
  'lens'
] as const;

export type ParamConsumer = 'gpu' | 'runtime' | 'event' | 'midi';
export type GpuUniformSlot =
  | 'mix'
  | 'p0'
  | 'p1'
  | 'p2'
  | 'p3'
  | 'aux1'
  | 'aux2'
  | 'aux3'
  | 'aux4'
  | 'accent';

export interface ParamContract {
  consumers: readonly ParamConsumer[];
  gpuSlot?: GpuUniformSlot;
}

export interface ModuleControlContract {
  id: string;
  params: Record<string, ParamContract>;
}

export interface LoopAux {
  speedRamp?: { aux1: number; aux2: number };
  timeSampler?: { aux1: number; aux2: number };
}

/** Direct 0–100 param → uniform slot. Engine still divides p0–p3 by 100. */
const GPU_DIRECT: Record<string, Record<string, GpuUniformSlot>> = {
  transition: { mix: 'mix', amount: 'p0', duration: 'p1', type: 'p2', interval: 'p3' },
  speedramp: { mix: 'mix', spdMax: 'p0', spdMin: 'p1', len: 'p2' },
  tapdelay: { mix: 'mix', time: 'p0', feedback: 'p1', feel: 'p2', gate: 'p3', sens: 'accent' },
  timesampler: { mix: 'mix', rate: 'p0', slices: 'p1', size: 'p2' },
  punch: { mix: 'mix', amt: 'p0', dir: 'p1', snap: 'p2' },
  shake: { mix: 'mix', hand: 'p0', impact: 'p1', sway: 'p2' },
  orbit: { mix: 'mix', spd: 'p0', drift: 'p1', nudge: 'p2' },
  focus: { mix: 'mix', amt: 'p0', pulse: 'p1', soft: 'p2', xeye: 'p3' },
  anamorphic: { mix: 'mix', bars: 'p0', zoom: 'p1', flare: 'p2' },
  grain: { mix: 'mix', size: 'p0', amount: 'p1', drift: 'p2' },
  leak: { mix: 'mix', edge: 'p0', warmth: 'p1', drift: 'p2', type: 'p3' },
  dutch: { mix: 'mix', tilt: 'p0', drift: 'p1', snap: 'p2' },
  halation: { mix: 'mix', threshold: 'p0', spread: 'p1', tint: 'p2' },
  bulge: { mix: 'mix', amount: 'p0', center: 'p1', falloff: 'p2', beat: 'p3' },
  vhs: { mix: 'mix', tracking: 'p0', chroma: 'p1', noise: 'p2', beat: 'p3' },
  prism: { mix: 'mix', split: 'p0', angle: 'p1', edge: 'p2' },
  streak: { mix: 'mix', length: 'p0', angle: 'p1', decay: 'p2' },
  mirror: { mix: 'mix', fold: 'p0', offset: 'p1', spin: 'p2', beat: 'p3' },
  lens: { mix: 'mix', amount: 'p0', zoom: 'p1', edge: 'p2', beat: 'p3' }
};

/** GPU slots that are derived rather than copied 0–100. */
const GPU_SCALED: Record<string, Record<string, GpuUniformSlot>> = {
  leak: { freq: 'aux1', hold: 'aux2', blades: 'aux3', squeeze: 'aux4', audio: 'accent' }
};

/**
 * Params the JS runtime reads. Overlaps with GPU are allowed (SPEEDRAMP rate
 * range is both a uniform and the bezier solve; TIMESAMPLER size/slices/rate
 * feed the scheduler and the shader).
 */
const RUNTIME_PARAMS: Record<string, readonly string[]> = {
  speedramp: ['len', 'spdMin', 'spdMax', 'bzY0', 'bzX1', 'bzY1', 'bzX2', 'bzY2', 'bzY3'],
  timesampler: ['mode', 'size', 'slices', 'loops', 'rate', 'accent', 'chance']
};

/** Visible fire/retrigger controls. `trig` is not a GPU slot. */
const EVENT_PARAMS: Record<string, readonly string[]> = {
  transition: ['trig']
};

function addConsumer(
  params: Record<string, ParamContract>,
  key: string,
  consumer: ParamConsumer,
  gpuSlot?: GpuUniformSlot
) {
  const existing = params[key];
  const consumers = existing
    ? [...new Set([...existing.consumers, consumer])]
    : [consumer];
  params[key] = {
    consumers,
    gpuSlot: gpuSlot ?? existing?.gpuSlot
  };
}

function contractFor(def: ModuleDefinition): ModuleControlContract {
  const params: Record<string, ParamContract> = {};
  const direct = GPU_DIRECT[def.id] ?? {};
  for (const [key, slot] of Object.entries(direct)) {
    addConsumer(params, key, 'gpu', slot);
  }
  for (const [key, slot] of Object.entries(GPU_SCALED[def.id] ?? {})) {
    addConsumer(params, key, 'gpu', slot);
  }
  for (const key of RUNTIME_PARAMS[def.id] ?? []) {
    addConsumer(params, key, 'runtime');
  }
  for (const key of EVENT_PARAMS[def.id] ?? []) {
    addConsumer(params, key, 'event');
  }
  const midi = MIDI_TIMING_CONTRACTS[def.id as keyof typeof MIDI_TIMING_CONTRACTS];
  if (midi?.density) addConsumer(params, 'density', 'midi');
  return { id: def.id, params };
}

export const MODULE_CONTROL_CONTRACTS: Record<string, ModuleControlContract> = Object.fromEntries(
  listCatalog().map((def) => [def.id, contractFor(def)])
);

export function moduleControlContract(id: string): ModuleControlContract | undefined {
  return MODULE_CONTROL_CONTRACTS[id];
}

export function defaultRackIdentities(): string[] {
  return [...DEFAULT_RACK_TOP, ...DEFAULT_RACK_BOTTOM];
}

export function paletteSwapIdentities(): string[] {
  const held = new Set(defaultRackIdentities());
  return listCatalog().map((def) => def.id).filter((id) => !held.has(id));
}

export function gpuUniformsForModule(
  moduleId: string,
  params: Record<string, number>,
  aux: LoopAux = {}
): ModuleRenderParams {
  const map = GPU_DIRECT[moduleId];
  if (!map) return { mix: params.mix ?? 0 };

  const out: ModuleRenderParams = {};
  for (const [key, slot] of Object.entries(map)) {
    const value = params[key];
    if (value != null) out[slot] = value;
  }

  if (moduleId === 'leak') {
    out.aux1 = (params.freq ?? 45) / 100;
    out.aux2 = (params.hold ?? 30) / 100;
    out.aux3 = 5 + Math.round(((params.blades ?? 50) / 100) * 4);
    out.aux4 = (params.squeeze ?? 0) / 100;
    out.accent = (params.audio ?? 40) / 100;
  }

  if (moduleId === 'speedramp') {
    out.aux1 = aux.speedRamp?.aux1 ?? 1;
    out.aux2 = aux.speedRamp?.aux2 ?? 0;
  }

  if (moduleId === 'timesampler') {
    out.accent = 0;
    out.aux1 = aux.timeSampler?.aux1 ?? 0;
    out.aux2 = aux.timeSampler?.aux2 ?? 2;
  }

  if (out.mix == null) out.mix = params.mix ?? 0;
  return out;
}
