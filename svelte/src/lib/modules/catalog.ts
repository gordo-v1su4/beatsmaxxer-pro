import type { ModuleConfig } from '$lib/engine/contracts';

/** Which rack row(s) a module can occupy. */
export type ModuleRowAffinity = 'top' | 'bottom' | 'both';

/** Palette grouping — beat-synced FX, camera moves, film/texture looks. */
export type ModuleCategory = 'beat' | 'camera' | 'film';

/** Full module definition — register new effects here to appear in the palette. */
export interface ModuleDefinition extends ModuleConfig {
  row: ModuleRowAffinity;
  category: ModuleCategory;
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
    category: 'beat',
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
    category: 'beat',
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
    category: 'beat',
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
    category: 'beat',
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
    category: 'camera',
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
    category: 'camera',
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
    category: 'camera',
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
    category: 'camera',
    compact: true,
    shaderKey: 'focus',
    description: 'Rack focus pull',
    params: { amt: 35, pulse: 55, soft: 45, xeye: 0, mix: 100 }
  },
  {
    id: 'anamorphic',
    name: 'ANAMORPHIC',
    shortName: '2.39',
    accentColor: '#64748b',
    row: 'bottom',
    category: 'film',
    compact: true,
    shaderKey: 'anamorphic',
    description: 'Scope letterbox + squeeze',
    params: { bars: 55, squeeze: 35, flare: 20, mix: 100 }
  },
  {
    id: 'grain',
    name: 'FILM GRAIN',
    shortName: 'GRAIN',
    accentColor: '#94a3b8',
    row: 'bottom',
    category: 'film',
    compact: true,
    shaderKey: 'grain',
    description: '16mm grain + gate weave',
    params: { size: 40, amount: 45, drift: 25, mix: 65 }
  },
  {
    id: 'leak',
    name: 'LIGHT LEAK',
    shortName: 'LEAK',
    accentColor: '#f97316',
    row: 'top',
    category: 'film',
    shaderKey: 'leak',
    description: 'Warm edge light leak',
    params: { edge: 50, warmth: 60, drift: 35, mix: 55, in_: 80, out: 70 }
  },
  {
    id: 'dutch',
    name: 'DUTCH ANGLE',
    shortName: 'DUTCH',
    accentColor: '#c084fc',
    row: 'bottom',
    category: 'camera',
    compact: true,
    shaderKey: 'dutch',
    description: 'Tilted horizon drift',
    params: { tilt: 45, drift: 40, snap: 30, mix: 100 }
  },
  {
    id: 'halation',
    name: 'HALATION',
    shortName: 'GLOW',
    accentColor: '#fda4af',
    row: 'bottom',
    category: 'film',
    compact: true,
    shaderKey: 'halation',
    description: 'Highlight bloom / halation',
    params: { threshold: 55, spread: 45, tint: 35, mix: 70 }
  },
  {
    id: 'bulge',
    name: 'LENS BULGE',
    shortName: 'BULGE',
    accentColor: '#7dd3fc',
    row: 'bottom',
    category: 'camera',
    compact: true,
    shaderKey: 'bulge',
    description: 'Subtle barrel / fisheye bulge',
    params: { amount: 40, center: 50, falloff: 55, mix: 75 }
  },
  {
    id: 'vhs',
    name: 'VHS TAPE',
    shortName: 'VHS',
    accentColor: '#a8a29e',
    row: 'bottom',
    category: 'film',
    compact: true,
    shaderKey: 'vhs',
    description: 'Light tracking + color bleed',
    params: { tracking: 35, bleed: 45, noise: 30, mix: 55 }
  },
  {
    id: 'camcorder',
    name: 'CAMCORDER',
    shortName: 'CAM90',
    accentColor: '#86efac',
    row: 'bottom',
    category: 'film',
    compact: true,
    shaderKey: 'camcorder',
    description: '90s CCD interlace + soft highlight',
    params: { interlace: 40, ccd: 45, datestamp: 0, mix: 60 }
  },
  {
    id: 'prism',
    name: 'PRISM',
    shortName: 'PRISM',
    accentColor: '#818cf8',
    row: 'bottom',
    category: 'camera',
    compact: true,
    shaderKey: 'prism',
    description: 'Chromatic edge split',
    params: { split: 40, angle: 50, edge: 35, mix: 65 }
  },
  {
    id: 'streak',
    name: 'MOTION STREAK',
    shortName: 'STREAK',
    accentColor: '#fcd34d',
    row: 'top',
    category: 'beat',
    shaderKey: 'streak',
    description: 'Directional velocity streaks',
    params: { length: 50, angle: 35, decay: 45, mix: 60, in_: 80, out: 70 }
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

export function listByCategory(category: ModuleCategory): ModuleDefinition[] {
  return listCatalog().filter((m) => m.category === category);
}

export function catalogIds(): string[] {
  return [...MODULE_CATALOG.keys()];
}

export function canPlaceInRow(def: ModuleDefinition, row: 'top' | 'bottom'): boolean {
  return def.row === 'both' || def.row === row;
}
