import { ACCENTS } from '$lib/modules/palette';
import type { ClipTiming } from '$lib/runtime/timing/envelope';

/** Timing colors identify the active effect, never the original Perform slot. */
export const timingEffectAccent = (effect: ClipTiming['effect']) =>
  effect === 'ramp' ? ACCENTS.speedramp : effect === 'stutter' ? ACCENTS.timesampler : '#556070';
