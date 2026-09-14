import { describe, it, expect } from 'vitest';
import { stutterGrid, measureLabel, musicalFraction } from '$lib/components/timing/stutterGrid';
import { verifiedInterpolationFactor } from '$lib/runtime/timing/interpolation';

describe('Timing media identity and musical grid', () => {
  it('does not claim interpolation from a filename or unknown hash', () => {
    expect(verifiedInterpolationFactor('deck-1-720-rife4.mp4')).toBe(1);
    expect(verifiedInterpolationFactor('unknown')).toBe(1);
    expect(verifiedInterpolationFactor('6f31e3405be5f61e7e16262413d27426e395823d125b1d00adca8c0abc79e8b9')).toBe(4);
  });
  it('numbers beat and bar boundaries in 4/4', () => {
    expect([0,1,3,4,8].map(measureLabel)).toEqual(['1.1','1.2','1.4','2.1','3.1']);
    expect(measureLabel(.25)).toBe('1.1 +1/4');
    expect(musicalFraction(.1875)).toBe('3/16');
  });
  it('represents half-bar cycles without claiming a full bar', () => {
    const g=stutterGrid(.5,4);
    expect(g).toEqual({beats:2,bars:.5,ticks:[0,1,2],starts:[0,.5,1,1.5]});
  });
  it('includes fractional cycle ends and keeps long grids legible', () => {
    expect(stutterGrid(.25,3).ticks.at(-1)).toBe(.75);
    expect(stutterGrid(4,16).ticks).toHaveLength(17);
    expect(stutterGrid(4,16).bars).toBe(16);
  });
});
