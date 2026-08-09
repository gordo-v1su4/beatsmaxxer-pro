import { ACCENTS } from './palette';
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
    accentColor: ACCENTS.transition,
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
    accentColor: ACCENTS.speedramp,
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
    accentColor: ACCENTS.tapdelay,
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
    accentColor: ACCENTS.timesampler,
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
    accentColor: ACCENTS.punch,
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
    accentColor: ACCENTS.shake,
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
    accentColor: ACCENTS.orbit,
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
    accentColor: ACCENTS.focus,
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
    accentColor: ACCENTS.anamorphic,
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
    accentColor: ACCENTS.grain,
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
    accentColor: ACCENTS.leak,
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
    accentColor: ACCENTS.dutch,
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
    accentColor: ACCENTS.halation,
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
    accentColor: ACCENTS.bulge,
    row: 'bottom',
    category: 'camera',
    compact: true,
    shaderKey: 'bulge',
    description: 'Subtle barrel / fisheye bulge',
    params: { amount: 40, center: 50, falloff: 55, mix: 75 }
  },
  {
    id: 'vhs',
    name: 'VHS / CAM',
    shortName: 'TAPE',
    accentColor: ACCENTS.vhs,
    row: 'bottom',
    category: 'film',
    compact: true,
    shaderKey: 'vhs',
    description: 'Tape wave, tracking, chroma + beat glitch',
    params: { tracking: 35, chroma: 45, noise: 30, beat: 40, mix: 60 }
  },
  {
    id: 'prism',
    name: 'PRISM',
    shortName: 'PRISM',
    accentColor: ACCENTS.prism,
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
    accentColor: ACCENTS.streak,
    row: 'top',
    category: 'beat',
    shaderKey: 'streak',
    description: 'Directional velocity streaks',
    params: { length: 50, angle: 35, decay: 45, mix: 60, in_: 80, out: 70 }
  },
  {
    id: 'mirror',
    name: 'INCEPTION',
    shortName: 'MIRROR',
    accentColor: ACCENTS.mirror,
    row: 'bottom',
    category: 'camera',
    compact: true,
    shaderKey: 'mirror',
    description: 'Reflection folds: mirror planes, slabs, boxes',
    params: { fold: 0, offset: 50, spin: 50, beat: 40, mix: 100 }
  },
  {
    id: 'lens',
    name: 'SPECIALTY LENS',
    shortName: 'LENS',
    accentColor: ACCENTS.lens,
    row: 'bottom',
    category: 'camera',
    compact: true,
    shaderKey: 'lens',
    description: 'Fisheye to tele-crush glass + beat pump',
    params: { amount: 75, zoom: 50, edge: 45, beat: 30, mix: 100 }
  }
];

/** Central catalog — add modules here; they appear in the palette automatically. */
export const MODULE_CATALOG = new Map<string, ModuleDefinition>(
  defs.map((d) => [d.id, d])
);

// Both rows ship full at MAX_RACK_SLOTS_PER_ROW. The top row is exactly the
// BEAT FX family, which has five members; the bottom takes the four camera
// moves plus INCEPTION. Leaving two slots empty by default hid two working
// modules behind a drag nobody knew to perform.
export const DEFAULT_RACK_TOP = ['transition', 'speedramp', 'tapdelay', 'timesampler', 'streak'];
export const DEFAULT_RACK_BOTTOM = ['punch', 'mirror', 'shake', 'orbit', 'prism'];

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
