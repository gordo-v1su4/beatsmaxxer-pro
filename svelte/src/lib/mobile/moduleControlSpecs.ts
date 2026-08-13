/**
 * The hand-authored control surface for each module, in one place.
 *
 * `COMPACT_CONTROLS` used to live inside `CompactModule.svelte`, where only the
 * desktop rack could reach it. The phone renders the *same* parameters at four
 * times the size, so the table had to move somewhere both surfaces can import
 * it. It is reproduced here byte-for-byte — the desktop rack reads exactly the
 * object it always did, and any change to a button set now lands on both
 * surfaces at once instead of drifting apart.
 *
 * The mobile layer adds `MOBILE_SPECS` for the six modules the compact table
 * never covered (they got bespoke blocks in `ModuleControls.svelte` instead),
 * and `mobileSpecForModule` merges the two so the phone has one shape to render.
 */

export interface CompactControlSpec {
  buttons: { label: string; set: Record<string, number> }[];
  primary: string;
  sliders: { param: string; label: string }[];
  toggle?: { param: string; label: string };
}

export const COMPACT_CONTROLS: Record<string, CompactControlSpec> = {
  punch: {
    buttons: [
      { label: 'IN', set: { dir: 10 } },
      { label: 'ALT', set: { dir: 50 } },
      { label: 'OUT', set: { dir: 90 } }
    ],
    primary: 'dir',
    sliders: [
      { param: 'amt', label: 'AMOUNT' },
      { param: 'snap', label: 'SNAP' }
    ]
  },
  shake: {
    buttons: [
      { label: 'WALK', set: { impact: 22, hand: 22, sway: 15 } },
      { label: 'RUN', set: { impact: 48, hand: 45, sway: 30 } },
      { label: 'CHASE', set: { impact: 72, hand: 68, sway: 50 } },
      { label: 'RIOT', set: { impact: 100, hand: 100, sway: 85 } }
    ],
    primary: 'impact',
    sliders: [
      { param: 'hand', label: 'HANDHELD' },
      { param: 'sway', label: 'SWAY' }
    ]
  },
  orbit: {
    buttons: [
      { label: 'SLOW', set: { spd: 15, drift: 32, nudge: 20 } },
      { label: 'MED', set: { spd: 45, drift: 55, nudge: 40 } },
      { label: 'FAST', set: { spd: 72, drift: 75, nudge: 60 } },
      { label: 'WARP', set: { spd: 100, drift: 100, nudge: 90 } }
    ],
    primary: 'spd',
    sliders: [
      { param: 'drift', label: 'DRIFT' },
      { param: 'nudge', label: 'NUDGE' }
    ]
  },
  focus: {
    buttons: [
      { label: 'SOFT', set: { pulse: 22, amt: 18, soft: 30 } },
      { label: 'PULL', set: { pulse: 52, amt: 30, soft: 45 } },
      { label: 'HARD', set: { pulse: 78, amt: 50, soft: 60 } },
      { label: 'BLIND', set: { pulse: 100, amt: 88, soft: 95 } }
    ],
    primary: 'pulse',
    sliders: [
      { param: 'amt', label: 'AMOUNT' },
      { param: 'soft', label: 'BLOOM' }
    ],
    toggle: { param: 'xeye', label: 'XEYE' }
  },
  grain: {
    buttons: [
      { label: '16MM', set: { size: 25, amount: 30, drift: 15 } },
      { label: 'GATE', set: { size: 55, amount: 65, drift: 35 } },
      { label: 'WEAVE', set: { size: 40, amount: 50, drift: 70 } }
    ],
    primary: 'amount',
    sliders: [
      { param: 'size', label: 'SIZE' },
      { param: 'drift', label: 'DRIFT' }
    ]
  },
  dutch: {
    buttons: [
      { label: '5°', set: { tilt: 25, drift: 30, snap: 20 } },
      { label: 'DRIFT', set: { tilt: 55, drift: 55, snap: 35 } },
      { label: 'SNAP', set: { tilt: 70, drift: 40, snap: 85 } }
    ],
    primary: 'tilt',
    sliders: [
      { param: 'drift', label: 'DRIFT' },
      { param: 'snap', label: 'SNAP' }
    ]
  },
  anamorphic: {
    buttons: [
      { label: '2.39', set: { bars: 60, zoom: 40, flare: 25 } },
      { label: 'FLARE', set: { bars: 55, zoom: 35, flare: 70 } },
      { label: 'CROP', set: { bars: 70, zoom: 75, flare: 15 } }
    ],
    primary: 'bars',
    sliders: [
      { param: 'zoom', label: 'CROP' },
      { param: 'flare', label: 'FLARE' }
    ]
  },
  halation: {
    buttons: [
      { label: 'SOFT', set: { threshold: 40, spread: 35, tint: 30 } },
      { label: 'FLARE', set: { threshold: 60, spread: 55, tint: 50 } },
      { label: 'HOT', set: { threshold: 75, spread: 70, tint: 40 } }
    ],
    primary: 'threshold',
    sliders: [
      { param: 'spread', label: 'SPREAD' },
      { param: 'tint', label: 'TINT' }
    ]
  },
  // amount is signed around 50: PINCH sits below it, BULGE and FISH above.
  // PUMP leaves the warp strong but hands it to the beat gate.
  bulge: {
    buttons: [
      { label: 'PINCH', set: { amount: 22, center: 50, falloff: 55, beat: 0 } },
      { label: 'BULGE', set: { amount: 68, center: 50, falloff: 55, beat: 0 } },
      { label: 'FISH', set: { amount: 92, center: 50, falloff: 40, beat: 0 } },
      { label: 'PUMP', set: { amount: 85, center: 50, falloff: 60, beat: 85 } }
    ],
    primary: 'amount',
    sliders: [
      { param: 'center', label: 'CENTER' },
      { param: 'falloff', label: 'FALL' },
      { param: 'beat', label: 'BEAT' }
    ]
  },
  vhs: {
    buttons: [
      { label: 'CLEAN', set: { tracking: 15, chroma: 25, noise: 15, beat: 15 } },
      { label: 'WORN', set: { tracking: 50, chroma: 55, noise: 40, beat: 35 } },
      { label: 'GLITCH', set: { tracking: 45, chroma: 60, noise: 35, beat: 80 } },
      { label: 'WRECK', set: { tracking: 85, chroma: 80, noise: 70, beat: 100 } }
    ],
    primary: 'tracking',
    sliders: [
      { param: 'chroma', label: 'CHROMA' },
      { param: 'beat', label: 'BEAT' }
    ]
  },
  prism: {
    buttons: [
      { label: 'EDGE', set: { split: 30, angle: 50, edge: 35 } },
      { label: 'RAIN', set: { split: 55, angle: 35, edge: 50 } },
      { label: 'HEAVY', set: { split: 75, angle: 65, edge: 45 } }
    ],
    primary: 'split',
    sliders: [
      { param: 'angle', label: 'ANGLE' },
      { param: 'edge', label: 'EDGE' }
    ]
  },
  // Twelve folds, matching SPEEDRAMP's shape density. `fold` steps in
  // 100/11 so each button lands exactly on one shader branch.
  mirror: {
    buttons: [
      { label: 'MIR L', set: { fold: 0, offset: 50, spin: 50, beat: 20 } },
      { label: 'MIR R', set: { fold: 9, offset: 50, spin: 50, beat: 20 } },
      { label: 'MIR D', set: { fold: 18, offset: 50, spin: 50, beat: 25 } },
      { label: 'MIR U', set: { fold: 27, offset: 50, spin: 50, beat: 25 } },
      { label: 'QUAD', set: { fold: 36, offset: 50, spin: 50, beat: 30 } },
      { label: 'SLB V', set: { fold: 45, offset: 38, spin: 50, beat: 35 } },
      { label: 'SLB H', set: { fold: 55, offset: 38, spin: 50, beat: 35 } },
      { label: 'BOX', set: { fold: 64, offset: 34, spin: 50, beat: 40 } },
      { label: 'COR A', set: { fold: 73, offset: 50, spin: 50, beat: 30 } },
      { label: 'COR B', set: { fold: 82, offset: 50, spin: 50, beat: 30 } },
      { label: 'TUNL', set: { fold: 91, offset: 30, spin: 45, beat: 70 } },
      { label: 'SPIN', set: { fold: 100, offset: 42, spin: 62, beat: 55 } }
    ],
    primary: 'fold',
    sliders: [
      { param: 'offset', label: 'FOLD POS' },
      { param: 'beat', label: 'BEAT' }
    ]
  },
  lens: {
    buttons: [
      { label: 'FISH', set: { amount: 95, zoom: 55, edge: 55, beat: 30 } },
      { label: 'PEEP', set: { amount: 100, zoom: 20, edge: 85, beat: 25 } },
      { label: 'TELE', set: { amount: 15, zoom: 65, edge: 30, beat: 20 } },
      { label: 'PUMP', set: { amount: 70, zoom: 50, edge: 45, beat: 85 } }
    ],
    primary: 'amount',
    sliders: [
      { param: 'zoom', label: 'ZOOM' },
      { param: 'beat', label: 'BEAT' }
    ]
  }
};

/**
 * Half the closest gap between a group's own values.
 *
 * A fixed tolerance lights neighbouring buttons once a module has enough
 * variants to space them under 18 apart — INCEPTION's twelve folds sit 9.09
 * apart. Shared so the phone lights exactly the button the rack would.
 */
export function primaryTolerance(
  buttons: { set: Record<string, number> }[],
  primary: string
): number {
  const values = buttons
    .map((btn) => btn.set[primary])
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => a - b);
  let gap = Infinity;
  for (let i = 1; i < values.length; i++) gap = Math.min(gap, values[i]! - values[i - 1]!);
  return Number.isFinite(gap) ? Math.max(1, gap / 2) : 9;
}

/* ------------------------------------------------------------------ mobile */

export interface MobileButtonSpec {
  label: string;
  set: Record<string, number>;
  /** Bezier preview drawn inside the pad — SPEEDRAMP's twelve ramp shapes. */
  curve?: { y0: number; x1: number; y1: number; x2: number; y2: number; y3: number };
}

/**
 * How a pad decides it is lit.
 * - `exact`   — the param is an enum index (TRANSITION move, TIMESAMPLER mode).
 * - `nearest` — the param is continuous but the pads sit on known stops; the
 *               closest stop within half the smallest gap wins.
 * - `set`     — the pad writes several params at once and only reads as active
 *               when the whole shape is still close (SPEEDRAMP curves, LEAK).
 */
export type MobileMatch = 'exact' | 'nearest' | 'set';

export interface MobileButtonGroup {
  label: string;
  buttons: MobileButtonSpec[];
  match: MobileMatch;
  /** Param read by `exact` / `nearest`. */
  primary: string;
  /** `set` only — keys that count toward the distance. Defaults to all of them. */
  matchKeys?: string[];
  /** `set` only — largest summed distance that still counts as a hit. */
  tolerance?: number;
  /** Bump this param by one (mod 100) whenever a pad in the group is pressed. */
  retrigger?: string;
  /** Force a column count; otherwise pads auto-fill the row. */
  columns?: number;
}

export interface MobileModuleSpec {
  groups: MobileButtonGroup[];
  sliders: { param: string; label: string }[];
  toggles?: { param: string; label: string }[];
  /** Momentary controls — press bumps `param`, nothing latches. */
  actions?: { label: string; param: string }[];
}

/** Beat divisions shared by TRANSITION's FIRE and SPEEDRAMP's CYCLE. */
const DIVISIONS: MobileButtonSpec[] = [
  { label: '1BT', set: {} },
  { label: '2BT', set: {} },
  { label: '1BR', set: {} },
  { label: '2BR', set: {} },
  { label: '4BR', set: {} },
  { label: '6BR', set: {} },
  { label: '8BR', set: {} }
];
const DIVISION_VALUES = [7, 21, 36, 50, 64, 79, 93];

function divisions(param: string): MobileButtonSpec[] {
  return DIVISIONS.map((d, i) => ({ label: d.label, set: { [param]: DIVISION_VALUES[i]! } }));
}

/** SPEEDRAMP's twelve curves, as the bezier params they write. */
const RAMP_SHAPES = [
  { key: 'FLAT', pts: { y0: 50, x1: 33, y1: 50, x2: 66, y2: 50, y3: 50 } },
  { key: 'UP', pts: { y0: 0, x1: 40, y1: 15, x2: 70, y2: 85, y3: 100 } },
  { key: 'DOWN', pts: { y0: 100, x1: 30, y1: 85, x2: 60, y2: 15, y3: 0 } },
  { key: 'S', pts: { y0: 0, x1: 78, y1: 2, x2: 22, y2: 98, y3: 100 } },
  { key: 'DIP', pts: { y0: 100, x1: 35, y1: 0, x2: 65, y2: 0, y3: 100 } },
  { key: 'BUMP', pts: { y0: 0, x1: 35, y1: 100, x2: 65, y2: 100, y3: 0 } },
  { key: 'LATE+', pts: { y0: 50, x1: 80, y1: 50, x2: 92, y2: 64, y3: 100 } },
  { key: 'LATE-', pts: { y0: 50, x1: 80, y1: 50, x2: 92, y2: 36, y3: 0 } },
  { key: 'EASE+', pts: { y0: 100, x1: 8, y1: 64, x2: 20, y2: 50, y3: 50 } },
  { key: 'EASE-', pts: { y0: 0, x1: 8, y1: 36, x2: 20, y2: 50, y3: 50 } },
  { key: 'INV-S', pts: { y0: 0, x1: 90, y1: 100, x2: 10, y2: 0, y3: 100 } },
  { key: 'SLAM', pts: { y0: 0, x1: 96, y1: 0, x2: 99, y2: 100, y3: 100 } }
] as const;

const RAMP_BUTTONS: MobileButtonSpec[] = RAMP_SHAPES.map((sh) => ({
  label: sh.key,
  curve: { ...sh.pts },
  set: {
    bzY0: sh.pts.y0,
    bzX1: sh.pts.x1,
    bzY1: sh.pts.y1,
    bzX2: sh.pts.x2,
    bzY2: sh.pts.y2,
    bzY3: sh.pts.y3
  }
}));

/** TRANSITION's 16-move PACK. */
const TRANSITION_PACK = [
  'WHP L', 'WHP R', 'PSH U', 'PSH D',
  'WIPE', 'ROLL', 'ZOOM', 'GLTC',
  'TILT', 'SPIN', 'ZM -', 'BARS',
  'IRIS', 'SLCE', 'FLSH', 'DFOC'
].map((label, v) => ({ label, set: { type: v } }));

/**
 * The six modules the compact table never covered. Their desktop equivalents
 * are the bespoke `{:else if moduleId === ...}` blocks in ModuleControls.svelte;
 * the values here are lifted from those blocks unchanged.
 */
export const MOBILE_SPECS: Record<string, MobileModuleSpec> = {
  transition: {
    groups: [
      {
        label: 'MOVE',
        buttons: TRANSITION_PACK,
        match: 'exact',
        primary: 'type',
        // Picking a move on the rack also fires it, so you see the choice.
        retrigger: 'trig',
        columns: 4
      },
      { label: 'FIRE EVERY', buttons: divisions('interval'), match: 'nearest', primary: 'interval' }
    ],
    sliders: [
      { param: 'duration', label: 'MOVE LENGTH' },
      { param: 'amount', label: 'MOTION BLUR' }
    ],
    actions: [{ label: 'FIRE', param: 'trig' }]
  },
  speedramp: {
    groups: [
      {
        label: 'SHAPE',
        buttons: RAMP_BUTTONS,
        match: 'set',
        primary: 'bzY0',
        // The x controls only steer the curve between its ends; matching on the
        // four y values is what the rack does, and what reads as "same shape".
        matchKeys: ['bzY0', 'bzY1', 'bzY2', 'bzY3'],
        tolerance: 40,
        columns: 4
      },
      { label: 'CYCLE', buttons: divisions('len'), match: 'nearest', primary: 'len' }
    ],
    sliders: [
      { param: 'spdMin', label: 'RATE MIN' },
      { param: 'spdMax', label: 'RATE MAX' }
    ]
  },
  // id is 'tapdelay', the module is STUTTER — see the note in the catalog.
  tapdelay: {
    groups: [
      {
        label: 'LENGTH',
        buttons: [
          { label: '1/32', set: { time: 10 } },
          { label: '1/16', set: { time: 30 } },
          { label: '1/8T', set: { time: 50 } },
          { label: '1/8', set: { time: 70 } },
          { label: '1/4', set: { time: 90 } }
        ],
        match: 'nearest',
        primary: 'time'
      },
      {
        label: 'FEEL',
        buttons: [
          { label: 'STR8', set: { feel: 0 } },
          { label: 'SWNG', set: { feel: 1 } },
          { label: 'DOT', set: { feel: 2 } }
        ],
        match: 'exact',
        primary: 'feel'
      }
    ],
    sliders: [
      { param: 'gate', label: 'GATE LENGTH' },
      { param: 'sens', label: 'SENSITIVITY' },
      { param: 'feedback', label: 'HOLD' }
    ]
  },
  timesampler: {
    groups: [
      {
        label: 'MODE',
        buttons: [
          { label: 'FWD', set: { mode: 0 } },
          { label: 'REV', set: { mode: 1 } },
          { label: 'PONG', set: { mode: 2 } },
          { label: 'RND', set: { mode: 3 } }
        ],
        match: 'exact',
        primary: 'mode'
      },
      {
        label: 'JUMP',
        buttons: [
          { label: '1/16', set: { size: 10 } },
          { label: '1/8', set: { size: 30 } },
          { label: '1/4', set: { size: 50 } },
          { label: '1/2', set: { size: 70 } },
          { label: 'BAR', set: { size: 90 } }
        ],
        match: 'nearest',
        primary: 'size'
      },
      {
        label: 'SLICES',
        buttons: [4, 8, 16, 32].map((n) => ({ label: `${n}`, set: { slices: n } })),
        match: 'exact',
        primary: 'slices'
      },
      {
        label: 'LOOPS',
        buttons: [1, 2, 4, 8].map((n) => ({ label: `${n}`, set: { loops: n } })),
        match: 'exact',
        primary: 'loops'
      },
      {
        label: 'ACCENT',
        buttons: [
          { label: 'LUM', set: { accent: 0 } },
          { label: 'RGB', set: { accent: 1 } },
          { label: 'OFF', set: { accent: 2 } }
        ],
        match: 'exact',
        primary: 'accent'
      }
    ],
    sliders: [
      { param: 'rate', label: 'RATE' },
      { param: 'chance', label: 'SENSITIVITY' }
    ]
  },
  leak: {
    groups: [
      {
        // Six different light *events*, not six tints. `type` is read as a
        // discrete index by the shader, so these sit exactly on 0..5.
        label: 'TYPE',
        buttons: [
          { label: 'GATE', set: { type: 0, edge: 45, warmth: 66, drift: 30 } },
          { label: 'STREAK', set: { type: 1, edge: 60, warmth: 28, drift: 35 } },
          { label: 'SHAFT', set: { type: 2, edge: 40, warmth: 14, drift: 55 } },
          { label: 'CORNER', set: { type: 3, edge: 55, warmth: 84, drift: 25 } },
          { label: 'BURN', set: { type: 4, edge: 50, warmth: 96, drift: 40 } },
          { label: 'VEIL', set: { type: 5, edge: 35, warmth: 44, drift: 30 } },
          { label: 'PRISM', set: { type: 6, edge: 55, warmth: 50, drift: 35 } }
        ],
        match: 'exact',
        primary: 'type',
        tolerance: 0.5
      }
    ],
    sliders: [
      { param: 'edge', label: 'EDGE' },
      { param: 'warmth', label: 'WARMTH' },
      { param: 'drift', label: 'DRIFT' }
    ]
  },
  streak: {
    groups: [
      {
        label: 'LOOK',
        buttons: [
          { label: 'H-SMR', set: { length: 40, angle: 10, decay: 45 } },
          { label: 'DIAG', set: { length: 60, angle: 45, decay: 50 } },
          { label: 'LONG', set: { length: 85, angle: 25, decay: 35 } }
        ],
        match: 'set',
        primary: 'length',
        tolerance: 20
      }
    ],
    sliders: [
      { param: 'length', label: 'LENGTH' },
      { param: 'angle', label: 'ANGLE' },
      { param: 'decay', label: 'DECAY' }
    ]
  }
};

function fromCompact(spec: CompactControlSpec): MobileModuleSpec {
  return {
    groups: [
      {
        label: 'VARIANT',
        buttons: spec.buttons,
        match: 'nearest',
        primary: spec.primary,
        columns: spec.buttons.length > 8 ? 4 : undefined
      }
    ],
    sliders: spec.sliders,
    toggles: spec.toggle ? [spec.toggle] : undefined
  };
}

/**
 * The phone's spec for a module, or null when nobody has authored one — in
 * which case the caller enumerates `Object.keys(params)`, exactly as the rack's
 * final `{:else}` branch does.
 */
export function mobileSpecForModule(id: string): MobileModuleSpec | null {
  const authored = MOBILE_SPECS[id];
  if (authored) return authored;
  const compact = COMPACT_CONTROLS[id];
  return compact ? fromCompact(compact) : null;
}

/** Params every module carries as plumbing rather than as an effect control. */
export const PLUMBING_PARAMS = new Set(['mix', 'in_', 'out']);
