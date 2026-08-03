/** Module accent palette.
 *
 * Accents are a three-family system rather than nineteen independent hues, so a
 * module's colour states its category before you read the name:
 *
 *   BEAT FX         green -> teal -> cyan     rhythm and time
 *   CAMERA          blue -> violet -> fuchsia optics and movement
 *   FILM / TEXTURE  amber -> orange + stone   emulsion and tape
 *
 * Within a family the ramp alternates a light step with a deep step while it
 * walks the hue arc. Stepping hue alone left neighbours looking like the same
 * colour at 10px; varying lightness as well is what makes adjacent modules
 * separate at a glance. Keep new modules on their family arc — a one-off hue
 * outside these three reads as an error, not as emphasis.
 *
 * Values stay bright enough to carry as small bold text on the near-black rack.
 * They also feed the WGSL accent uniform, so idle cards, beat flashes and the
 * live-module outline all inherit the same family colour.
 */
export const ACCENTS = {
  // BEAT FX — green through teal to cyan, alternating light and deep
  transition: '#4ade80',
  speedramp: '#99f6e4',
  tapdelay: '#14b8a6',
  timesampler: '#67e8f9',
  streak: '#06b6d4',

  // CAMERA — blue through violet to fuchsia, alternating light and deep
  punch: '#60a5fa',
  shake: '#a5b4fc',
  orbit: '#6366f1',
  focus: '#c4b5fd',
  dutch: '#8b5cf6',
  bulge: '#d8b4fe',
  prism: '#a855f7',
  mirror: '#f0abfc',
  lens: '#d946ef',

  // FILM / TEXTURE — amber to orange, with tape held neutral
  anamorphic: '#fbbf24',
  grain: '#fde68a',
  leak: '#f97316',
  halation: '#fdba74',
  vhs: '#d6d3d1'
} as const;

export type AccentKey = keyof typeof ACCENTS;
