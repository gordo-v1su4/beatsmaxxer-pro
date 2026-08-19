import type { ModuleType } from '$lib/engine/contracts';
import { catalogIds } from '$lib/modules/catalog';

export type ModulePreset = { n: string; title: string; set: Record<string, number> };

export const MODULE_PRESETS: Record<string, ModulePreset[]> = Object.fromEntries(
  catalogIds().map((id) => [id, presetsFor(id)])
);

function presetsFor(id: string): ModulePreset[] {
  switch (id) {
    case 'transition':
      return [
        { n: '1', title: 'Whip bar — sharp 1-beat wipe', set: { type: 0, interval: 10, duration: 25, amount: 75, mix: 100, in_: 85, out: 80 } },
        { n: '2', title: 'Iris punch — 2-bar iris', set: { type: 12, interval: 50, duration: 45, amount: 85, mix: 100, in_: 90, out: 75 } },
        { n: '3', title: 'Glitch storm — 1/2 bar flash', set: { type: 6, interval: 70, duration: 15, amount: 95, mix: 100, in_: 80, out: 70 } }
      ];
    case 'speedramp':
      return [
        { n: '1', title: 'Slam in — late ease to 4×', set: { len: 10, spdMin: 25, spdMax: 100, bzY0: 100, bzY3: 0, mix: 100, in_: 85, out: 70 } },
        { n: '2', title: 'Breath — 1-bar swell', set: { len: 50, spdMin: 40, spdMax: 85, bzY0: 50, bzY3: 50, mix: 90, in_: 80, out: 80 } },
        { n: '3', title: 'Stutter halt — drop to ¼×', set: { len: 30, spdMin: 0, spdMax: 60, bzY0: 100, bzY3: 100, mix: 100, in_: 75, out: 65 } }
      ];
    case 'tapdelay':
      return [
        { n: '1', title: 'Swung triplet hold', set: { time: 50, feedback: 55, feel: 1, gate: 72, sens: 20, mix: 72 } },
        { n: '2', title: 'Dotted gated stab', set: { time: 30, feedback: 72, feel: 2, gate: 38, sens: 45, mix: 82 } },
        { n: '3', title: 'Hard sixteenth lock', set: { time: 70, feedback: 92, feel: 0, gate: 100, sens: 70, mix: 100 } }
      ];
    case 'timesampler':
      return [
        { n: '1', title: 'Bar march — eight unique slices', set: { mode: 0, size: 90, slices: 8, loops: 1, accent: 0, chance: 40, rate: 43, mix: 72 } },
        { n: '2', title: 'Pong halves — chroma landings', set: { mode: 2, size: 70, slices: 16, loops: 1, accent: 1, chance: 55, rate: 43, mix: 78 } },
        { n: '3', title: 'Random juggle — fast teleports', set: { mode: 3, size: 50, slices: 32, loops: 1, accent: 0, chance: 75, rate: 62, mix: 90 } }
      ];
    case 'punch':
      return [
        { n: '1', title: 'Crash in', set: { dir: 10, amt: 80, snap: 70, mix: 100 } },
        { n: '2', title: 'Pulse alt', set: { dir: 50, amt: 55, snap: 45, mix: 85 } },
        { n: '3', title: 'Snap out', set: { dir: 90, amt: 65, snap: 90, mix: 100 } }
      ];
    case 'shake':
      return [
        { n: '1', title: 'Walk', set: { hand: 22, impact: 22, sway: 15, mix: 100 } },
        { n: '2', title: 'Run', set: { hand: 48, impact: 48, sway: 30, mix: 100 } },
        { n: '3', title: 'Riot', set: { hand: 100, impact: 100, sway: 85, mix: 100 } }
      ];
    case 'orbit':
      return [
        { n: '1', title: 'Slow drift', set: { spd: 20, drift: 35, nudge: 25, mix: 100 } },
        { n: '2', title: 'Medium orbit', set: { spd: 45, drift: 55, nudge: 40, mix: 100 } },
        { n: '3', title: 'Fast chase', set: { spd: 75, drift: 70, nudge: 60, mix: 100 } }
      ];
    case 'focus':
      return [
        { n: '1', title: 'Soft pull', set: { amt: 30, pulse: 40, soft: 60, xeye: 0, mix: 100 } },
        { n: '2', title: 'Hard rack', set: { amt: 70, pulse: 65, soft: 30, xeye: 0, mix: 100 } },
        { n: '3', title: 'X-eye split', set: { amt: 50, pulse: 55, soft: 45, xeye: 100, mix: 100 } }
      ];
    case 'grain':
      return [
        { n: '1', title: 'Light 16mm', set: { size: 25, amount: 30, drift: 15, mix: 45 } },
        { n: '2', title: 'Heavy gate', set: { size: 55, amount: 65, drift: 35, mix: 60 } },
        { n: '3', title: 'Weave', set: { size: 40, amount: 50, drift: 70, mix: 55 } }
      ];
    case 'leak':
      // Every preset names its type as well as its dials. The old three set no
      // type at all, so all of them landed on whatever the module happened to
      // be on and only moved SIZE/WARMTH/MIX -- three tints of one shape, which
      // is the complaint the whole module was rebuilt around.
      //
      // Paired cool and warm across the range: WARMTH is sharpened around its
      // midpoint, so anything near 50 reads neutral and the character lives out
      // at the ends.
      return [
        { n: '1', title: 'Iris ghosts — round six-blade discs, slow drift', set: { type: 0, edge: 55, warmth: 34, drift: 25, blades: 25, squeeze: 0, freq: 30, hold: 55, audio: 35, mix: 60, in_: 80, out: 70 } },
        { n: '2', title: 'Oval bokeh — squeezed pupil, kick-driven stabs', set: { type: 0, edge: 45, warmth: 40, drift: 30, blades: 75, squeeze: 45, freq: 82, hold: 14, audio: 85, mix: 65, in_: 80, out: 70 } },
        { n: '3', title: 'Blue anamorphic — hard coated streak', set: { type: 1, edge: 60, warmth: 16, drift: 35, blades: 100, squeeze: 90, freq: 45, hold: 35, audio: 55, mix: 75, in_: 85, out: 75 } },
        { n: '4', title: 'Sunstar — five straight blades, ten rays', set: { type: 2, edge: 45, warmth: 30, drift: 45, blades: 0, squeeze: 0, freq: 55, hold: 22, audio: 70, mix: 70, in_: 85, out: 75 } },
        { n: '5', title: 'Newton rings — interference fringes drifting', set: { type: 3, edge: 50, warmth: 42, drift: 20, blades: 50, squeeze: 0, freq: 26, hold: 62, audio: 20, mix: 65, in_: 80, out: 70 } },
        { n: '6', title: 'Edge fog — a long pass leaking off the border', set: { type: 4, edge: 50, warmth: 76, drift: 30, blades: 50, squeeze: 0, freq: 18, hold: 78, audio: 15, mix: 70, in_: 85, out: 75 } },
        { n: '7', title: 'Ice veil — cold glare breathing on the low end', set: { type: 5, edge: 40, warmth: 6, drift: 25, blades: 50, squeeze: 0, freq: 38, hold: 66, audio: 75, mix: 55, in_: 75, out: 65 } },
        { n: '8', title: 'Prism — spectral fringe, split per wavelength', set: { type: 6, edge: 55, warmth: 50, drift: 35, blades: 50, squeeze: 15, freq: 45, hold: 40, audio: 45, mix: 65, in_: 80, out: 70 } }
      ];
    case 'vhs':
      return [
        { n: '1', title: 'Clean deck', set: { tracking: 15, chroma: 25, noise: 15, beat: 15, mix: 45 } },
        { n: '2', title: 'Worn tape', set: { tracking: 50, chroma: 55, noise: 40, beat: 35, mix: 60 } },
        { n: '3', title: 'CCD cam', set: { tracking: 25, chroma: 65, noise: 55, beat: 25, mix: 65 } },
        { n: '4', title: 'Beat glitch', set: { tracking: 45, chroma: 60, noise: 35, beat: 80, mix: 80 } },
        { n: '5', title: 'Wrecked', set: { tracking: 85, chroma: 80, noise: 70, beat: 100, mix: 85 } }
      ];
    case 'bulge':
      return [
        { n: '1', title: 'Subtle barrel', set: { amount: 25, center: 50, falloff: 55, mix: 60 } },
        { n: '2', title: 'Fisheye hit', set: { amount: 65, center: 50, falloff: 40, mix: 80 } },
        { n: '3', title: 'Center pop', set: { amount: 45, center: 50, falloff: 70, mix: 70 } }
      ];
    case 'halation':
      return [
        { n: '1', title: 'Soft bloom', set: { threshold: 40, spread: 35, tint: 30, mix: 55 } },
        { n: '2', title: 'Ana flare', set: { threshold: 60, spread: 55, tint: 50, mix: 70 } },
        { n: '3', title: 'Hot highlight', set: { threshold: 75, spread: 70, tint: 40, mix: 75 } }
      ];
    case 'dutch':
      return [
        { n: '1', title: '5° tilt', set: { tilt: 25, drift: 30, snap: 20, mix: 100 } },
        { n: '2', title: 'Dutch drift', set: { tilt: 55, drift: 55, snap: 35, mix: 100 } },
        { n: '3', title: 'Snap dutch', set: { tilt: 70, drift: 40, snap: 85, mix: 100 } }
      ];
    case 'anamorphic':
      return [
        { n: '1', title: '2.39 scope', set: { bars: 60, zoom: 40, flare: 25, mix: 100 } },
        { n: '2', title: 'Flare heavy', set: { bars: 55, zoom: 35, flare: 70, mix: 100 } },
        { n: '3', title: 'Tight crop', set: { bars: 70, zoom: 75, flare: 15, mix: 90 } }
      ];
    case 'prism':
      return [
        { n: '1', title: 'Edge split', set: { split: 30, angle: 50, edge: 35, mix: 60 } },
        { n: '2', title: 'Rainbow fringe', set: { split: 55, angle: 35, edge: 50, mix: 70 } },
        { n: '3', title: 'Heavy prism', set: { split: 75, angle: 65, edge: 45, mix: 75 } }
      ];
    case 'streak':
      return [
        { n: '1', title: 'Horizontal smear', set: { length: 40, angle: 10, decay: 45, mix: 55, in_: 80, out: 70 } },
        { n: '2', title: 'Diagonal drag', set: { length: 60, angle: 45, decay: 50, mix: 65, in_: 85, out: 75 } },
        { n: '3', title: 'Long exposure', set: { length: 85, angle: 25, decay: 35, mix: 75, in_: 90, out: 80 } }
      ];
    case 'mirror':
      return [
        { n: '1', title: 'Mirror wall', set: { fold: 0, offset: 50, spin: 50, beat: 20, mix: 100 } },
        { n: '2', title: 'Twin sky', set: { fold: 25, offset: 45, spin: 50, beat: 20, mix: 100 } },
        { n: '3', title: 'Quad fold', set: { fold: 50, offset: 50, spin: 50, beat: 30, mix: 100 } },
        { n: '4', title: 'Kaleido six', set: { fold: 75, offset: 50, spin: 60, beat: 55, mix: 100 } },
        { n: '5', title: 'Inception', set: { fold: 100, offset: 50, spin: 40, beat: 75, mix: 100 } }
      ];
    case 'lens':
      return [
        { n: '1', title: 'GoPro wide', set: { amount: 68, zoom: 40, edge: 35, beat: 15, mix: 100 } },
        { n: '2', title: 'Full fish', set: { amount: 95, zoom: 55, edge: 55, beat: 30, mix: 100 } },
        { n: '3', title: 'Peephole', set: { amount: 100, zoom: 20, edge: 85, beat: 25, mix: 100 } },
        { n: '4', title: 'Tele crush', set: { amount: 15, zoom: 65, edge: 30, beat: 20, mix: 100 } },
        { n: '5', title: 'Beat pump', set: { amount: 70, zoom: 50, edge: 45, beat: 85, mix: 100 } }
      ];
    default:
      return [
        { n: '1', title: 'Subtle', set: { mix: 45 } },
        { n: '2', title: 'Medium', set: { mix: 70 } },
        { n: '3', title: 'Full wet', set: { mix: 100 } }
      ];
  }
}

export function presetsForModule(id: ModuleType | string): ModulePreset[] {
  return MODULE_PRESETS[id] ?? presetsFor(id);
}
