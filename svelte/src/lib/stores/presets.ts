import { writable } from 'svelte/store';
import { runRackParamTransaction, updateParam } from '$lib/stores/rack';
import { DEFAULT_RACK_BOTTOM, DEFAULT_RACK_TOP } from '$lib/modules/catalog';

export const FACTORY_PRESETS = [
  'Cascade Combo',
  'Big Head Mode',
  'Fog of War',
  'Ghost Room',
  'Lag Spike Delay',
  'Noclip Phase',
  'Overclocked',
  'Resonant Mist',
  'Sizzle Damage',
  'Vortex Spell',
  'World Map Chorus'
] as const;

export type PresetName = (typeof FACTORY_PRESETS)[number];

/** One macro dot per rack module — colors match module accents. */
export const RACK_MACRO_MODULES = [...DEFAULT_RACK_TOP, ...DEFAULT_RACK_BOTTOM] as const;
export type RackMacroId = (typeof RACK_MACRO_MODULES)[number];

export const RACK_MACRO_DEFS: Record<
  RackMacroId,
  { param: string; min: number; max: number; color: string; short: string }
> = {
  transition: { param: 'amount', min: 20, max: 100, color: '#22c55e', short: 'TR' },
  speedramp: { param: 'spdMax', min: 25, max: 100, color: '#f59e0b', short: 'RM' },
  tapdelay: { param: 'feedback', min: 10, max: 90, color: '#38bdf8', short: 'DL' },
  timesampler: { param: 'chance', min: 0, max: 100, color: '#fde047', short: 'SM' },
  punch: { param: 'amt', min: 15, max: 95, color: '#fb7185', short: 'PZ' },
  shake: { param: 'impact', min: 10, max: 100, color: '#a78bfa', short: 'HH' },
  orbit: { param: 'drift', min: 15, max: 85, color: '#2dd4bf', short: 'DC' },
  focus: { param: 'amt', min: 10, max: 90, color: '#e2c08d', short: 'RF' },
  streak: { param: 'length', min: 15, max: 90, color: '#06b6d4', short: 'ST' },
  mirror: { param: 'offset', min: 20, max: 80, color: '#f0abfc', short: 'IN' }
};

export type MacroState = Record<RackMacroId, number>;

const DEFAULT_MACROS: MacroState = {
  transition: 72,
  speedramp: 55,
  tapdelay: 48,
  timesampler: 65,
  punch: 60,
  shake: 55,
  orbit: 50,
  focus: 45,
  streak: 45,
  mirror: 50
};

/** Presets name only the macros they care about; the rest fall back to
 *  DEFAULT_MACROS, so racking a new module does not mean editing 16 literals. */
export const PRESET_MACRO_MAP: Record<PresetName, Partial<MacroState>> = {
  'Cascade Combo': { transition: 72, speedramp: 55, tapdelay: 48, timesampler: 65, punch: 60, shake: 55, orbit: 50, focus: 45 },
  'Big Head Mode': { transition: 88, speedramp: 35, tapdelay: 62, timesampler: 50, punch: 85, shake: 40, orbit: 35, focus: 55 },
  'Fog of War': { transition: 40, speedramp: 70, tapdelay: 55, timesampler: 45, punch: 35, shake: 65, orbit: 60, focus: 70 },
  'Ghost Room': { transition: 25, speedramp: 60, tapdelay: 80, timesampler: 35, punch: 30, shake: 75, orbit: 45, focus: 40 },
  'Lag Spike Delay': { transition: 50, speedramp: 85, tapdelay: 78, timesampler: 42, punch: 45, shake: 50, orbit: 55, focus: 48 },
  'Noclip Phase': { transition: 65, speedramp: 45, tapdelay: 90, timesampler: 55, punch: 70, shake: 60, orbit: 65, focus: 50 },
  'Overclocked': { transition: 95, speedramp: 92, tapdelay: 70, timesampler: 88, punch: 90, shake: 85, orbit: 80, focus: 75 },
  'Resonant Mist': { transition: 38, speedramp: 52, tapdelay: 68, timesampler: 42, punch: 40, shake: 58, orbit: 62, focus: 55 },
  'Sizzle Damage': { transition: 78, speedramp: 68, tapdelay: 58, timesampler: 82, punch: 75, shake: 70, orbit: 60, focus: 65 },
  'Vortex Spell': { transition: 60, speedramp: 75, tapdelay: 85, timesampler: 60, punch: 55, shake: 80, orbit: 70, focus: 58 },
  'World Map Chorus': { transition: 45, speedramp: 48, tapdelay: 72, timesampler: 70, punch: 50, shake: 45, orbit: 68, focus: 62 }
};

export const selectedPreset = writable<PresetName>('Cascade Combo');
export const macros = writable<MacroState>({ ...DEFAULT_MACROS });

export function selectPreset(name: PresetName) {
  selectedPreset.set(name);
  const preset = PRESET_MACRO_MAP[name];
  if (preset) {
    // Spreading a Partial widens every value to number|undefined; copy the keys
    // the preset actually names instead so the result stays a full MacroState.
    const m: MacroState = { ...DEFAULT_MACROS };
    for (const id of RACK_MACRO_MODULES) {
      const value = preset[id];
      if (typeof value === 'number') m[id] = value;
    }
    macros.set(m);
    applyMacrosToParams(m);
  }
}

export function updateModuleMacro(moduleId: RackMacroId, value: number) {
  macros.update((m) => {
    const next = { ...m, [moduleId]: value };
    applyOneMacro(moduleId, value);
    return next;
  });
}

function lerp(min: number, max: number, t: number) {
  return min + (max - min) * (t / 100);
}

function applyOneMacro(moduleId: RackMacroId, val: number) {
  const def = RACK_MACRO_DEFS[moduleId];
  if (!def) return;
  updateParam(moduleId, def.param, Math.round(lerp(def.min, def.max, val)));
}

export function applyMacrosToParams(m: MacroState) {
  runRackParamTransaction(() => {
    for (const id of RACK_MACRO_MODULES) applyOneMacro(id, m[id] ?? DEFAULT_MACROS[id]);
  });
}

export const macroBaseParams = writable<Record<string, Record<string, number>>>({});
