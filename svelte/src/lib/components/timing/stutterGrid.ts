import { stutterBoundaries } from '$lib/runtime/timing/triggers';
export function measureLabel(beat: number) {
  const whole = Math.floor(beat), fraction = beat - whole;
  return `${Math.floor(whole / 4) + 1}.${whole % 4 + 1}${fraction > 1e-6 ? ` +${musicalFraction(fraction)}` : ''}`;
}
export function musicalFraction(value: number): string {
  let numerator = Math.round(value * 32), denominator = 32;
  while (numerator % 2 === 0 && denominator > 1) { numerator /= 2; denominator /= 2; }
  return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`;
}
export function stutterGrid(division: number, repeats: number, groove: 'straight'|'swing'|'dotted'='straight') {
  const boundaries=stutterBoundaries({division,repeats,groove,mode:'repeat',slices:8});
  const beats = boundaries.at(-1)!;
  const step = beats > 16 ? 4 : beats < 1 ? division : 1;
  const ticks = Array.from({length: Math.floor(beats / step) + 1}, (_, i) => i * step);
  if (Math.abs(ticks.at(-1)! - beats) > 1e-6) ticks.push(beats);
  return { beats, bars: beats / 4, ticks,
    starts: boundaries.slice(0,-1) };
}
