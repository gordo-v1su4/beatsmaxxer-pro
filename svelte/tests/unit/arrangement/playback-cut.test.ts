import { expect, test } from 'vitest';
import { activeTakeCutAt } from '$lib/arrangement/playbackCut';

test('a loop begins with the cut that was active before its start',()=>{
  const active={step:209,slotIndex:6,timeSeconds:25.12};
  expect(activeTakeCutAt([active,{step:216,slotIndex:3,timeSeconds:25.93}],25.46,step=>step/8)).toBe(active);
});
test('legacy steps and timestamped cuts resolve in time order',()=>{
  const old={step:8,slotIndex:0},next={step:2,slotIndex:7,timeSeconds:2.5};
  expect(activeTakeCutAt([next,old],2,step=>step/4)).toBe(old);
  expect(activeTakeCutAt([next,old],2.5,step=>step/4)).toBe(next);
});
