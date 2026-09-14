import { expect, test } from 'vitest';
import { constrainPointX, defaultClipTiming, evaluateRamp, integratedRamp, snapPosition, snapRate, type RampConfig } from '$lib/runtime/timing/envelope';

const ramp: RampConfig = { cycleBeats: 4, shape: 'smooth', points: [
  { id: 'a', x: 0, y: 0, tension: 0 }, { id: 'b', x: .3, y: .2, tension: 0 },
  { id: 'c', x: .7, y: .8, tension: 0 }, { id: 'd', x: 1, y: 1, tension: 0 }
] };
test('new curves are smooth and finer grid positions sit between old sixteenths', () => {
  expect(defaultClipTiming().ramp.shape).toBe('smooth');
  expect(evaluateRamp(defaultClipTiming().ramp,0)).toBe(1);
  expect(evaluateRamp(defaultClipTiming().ramp,1)).toBe(1);
  expect(snapRate(.63)).toBe(.75);
  expect(snapRate(2.84)).toBe(2.75);
  expect(snapPosition(.063,'32nd',2)).toBe(.0625);
  expect(snapPosition(.032,'64th',2)).toBe(.03125);
});
test('dragging cannot stack a point on its neighbour or snap to a near-zero separation', () => {
  const points=[{id:'a',x:0,y:0,tension:0},{id:'b',x:.5,y:.5,tension:0},{id:'c',x:1,y:1,tension:0}];
  expect(constrainPointX(points,1,1,'32nd',2)).toBe(.9375);
  expect(constrainPointX(points,1,0,'32nd',2)).toBe(.0625);
  expect(constrainPointX(points,1,.423,'off',2)).toBe(.423);
});
test('smooth ramps flow through rising interior anchors without flattening every segment', () => {
  const h = 1e-5, x = .3;
  const left = (evaluateRamp(ramp, x) - evaluateRamp(ramp, x-h))/h;
  const right = (evaluateRamp(ramp, x+h) - evaluateRamp(ramp, x))/h;
  expect(left).toBeGreaterThan(1);
  expect(left).toBeCloseTo(right, 3);
});
test('smooth playback integrates the curve shown by the editor without overshoot', () => {
  const steps=10000;
  let area=0, previous=.25;
  for(let i=0;i<steps;i++){
    const rate=evaluateRamp(ramp,(i+.5)/steps);
    expect(rate).toBeGreaterThanOrEqual(previous);
    expect(rate).toBeLessThanOrEqual(4);
    previous=rate;area+=rate/steps;
  }
  expect(integratedRamp(ramp,1)).toBeCloseTo(area,7);
  const t=.47,h=1e-5;
  expect((integratedRamp(ramp,t+h)-integratedRamp(ramp,t-h))/(2*h)).toBeCloseTo(evaluateRamp(ramp,t),7);
});
