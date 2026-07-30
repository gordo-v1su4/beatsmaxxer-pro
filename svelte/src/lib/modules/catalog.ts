import type { ModuleConfig } from '$lib/engine/contracts';

/** Which rack row(s) a module can occupy. */
export type ModuleRowAffinity = 'top' | 'bottom' | 'both';

/** Full module definition — register new effects here to appear in the palette. */
export interface ModuleDefinition extends ModuleConfig {
  row: ModuleRowAffinity;
  /** Camera-style compact row module */
  compact?: boolean;
  /** WGSL shader registry key */
  shaderKey?: string;
  description?: string;
}

const defs: ModuleDefinition[] = [
  {
    id: 'transition',
    name: 'TRANSITION',
    shortName: 'TRANS',
    accentColor: '#22c55e',
    row: 'top',
    shaderKey: 'transition',
    description: '16 beat-synced transition moves',
    params: {
      type: 0, interval: 36, duration: 40, amount: 60, trig: 0,
      mix: 100, in_: 80, out: 75
    }
  },
  {
    id: 'speedramp',
    name: 'SPEEDRAMP',
    shortName: 'RAMP',
    accentColor: '#f59e0b',
    row: 'top',
    shaderKey: 'speedramp',
    description: 'Bezier playback-rate curve',
    params: {
      len: 36, spdMin: 25, spdMax: 75,
      bzY0: 100, bzX1: 35, bzY1: 0, bzX2: 65, bzY2: 0, bzY3: 100,
      mix: 100, in_: 80, out: 70
    }
  },
  {
    id: 'tapdelay',
    name: 'TAPDELAY',
    shortName: 'DELAY',
    accentColor: '#38bdf8',
    row: 'top',
    shaderKey: 'tapdelay',
    description: 'Stutter / scratch delay',
    params: {
      type: 1, velCrv: 55, end: 60, start: 25, filterSlider: 60,
      time: 60, feedback: 50, feel: 0,
      scratchMode: 0, scratchDepth: 45,
      mix: 55, in_: 80, out: 65
    }
  },
  {
    id: 'timesampler',
    name: 'TIMESAMPLER',
    shortName: 'SMPLR',
    accentColor: '#fde047',
    row: 'top',
    shaderKey: 'timesampler',
    description: 'Slice sampler jumps',
    params: {
      mode: 0, size: 50, slices: 8, loops: 2, accent: 0, chance: 60, rate: 43,
      mix: 60, in_: 80, out: 60
    }
  },
  {
    id: 'punch',
    name: 'PUNCH ZOOM',
    shortName: 'PUNCH',
    accentColor: '#fb7185',
    row: 'bottom',
    compact: true,
    shaderKey: 'punch',
    description: 'Crash zoom punch',
    params: { dir: 50, amt: 60, snap: 55, mix: 100 }
  },
  {
    id: 'shake',
    name: 'HANDHELD',
    shortName: 'SHAKE',
    accentColor: '#a78bfa',
    row: 'bottom',
    compact: true,
    shaderKey: 'shake',
    description: 'Handheld camera shake',
    params: { hand: 40, impact: 55, sway: 30, mix: 100 }
  },
  {
    id: 'orbit',
    name: 'DRIFT CAM',
    shortName: 'DRIFT',
    accentColor: '#2dd4bf',
    row: 'bottom',
    compact: true,
    shaderKey: 'orbit',
    description: 'Slow orbital drift',
    params: { spd: 35, drift: 50, nudge: 40, mix: 100 }
  },
  {
    id: 'focus',
    name: 'RACK FOCUS',
    shortName: 'FOCUS',
    accentColor: '#e2c08d',
    row: 'bottom',
    compact: true,
    shaderKey: 'focus',
    description: 'Rack focus pull',
    params: { amt: 35, pulse: 55, soft: 45, xeye: 0, mix: 100 }
  }
];

/** Central catalog — add modules here; they appear in the palette automatically. */
export const MODULE_CATALOG = new Map<string, ModuleDefinition>(
  defs.map((d) => [d.id, d])
);

export const DEFAULT_RACK_TOP = ['transition', 'speedramp', 'tapdelay', 'timesampler'];
export const DEFAULT_RACK_BOTTOM = ['punch', 'shake', 'orbit', 'focus'];

export function getModuleDef(id: string): ModuleDefinition | undefined {
  return MODULE_CATALOG.get(id);
}

export function listCatalog(): ModuleDefinition[] {
  return [...MODULE_CATALOG.values()];
}

export function catalogIds(): string[] {
  return [...MODULE_CATALOG.keys()];
}

export function canPlaceInRow(def: ModuleDefinition, row: 'top' | 'bottom'): boolean {
  return def.row === 'both' || def.row === row;
}
