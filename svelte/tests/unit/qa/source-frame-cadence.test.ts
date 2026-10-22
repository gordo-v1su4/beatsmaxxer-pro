import { describe,expect,it } from 'vitest';
import { createSourceFrameCadence } from '$lib/qa/sourceFrameCadence';

it('cadence factory survives serialization into a separate browser scope',()=>{
  const factory=new Function(`return (${createSourceFrameCadence.toString()})`)() as typeof createSourceFrameCadence;
  const cadence=factory(100);cadence.frame(140);
  expect(cadence.finish(500)).toEqual({callbacks:1,maxGapMs:360,trailingGapMs:360});
});
describe('native source frame cadence evidence',()=>{
  it('rejects two early frames followed by a freeze through the sample end',()=>{
    const cadence=createSourceFrameCadence(0);cadence.frame(20);cadence.frame(60);
    expect(cadence.finish(60000)).toEqual({callbacks:2,maxGapMs:59940,trailingGapMs:59940});
  });
  it('counts a missing first frame and a late first frame',()=>{
    expect(createSourceFrameCadence(100).finish(1100).maxGapMs).toBe(1000);
    const cadence=createSourceFrameCadence(100);expect(cadence.frame(1100)).toBe(1000);
  });
  it('retains source changes without resetting a gap at clip publication',()=>{
    const cadence=createSourceFrameCadence(0);cadence.frame(40);cadence.frame(80);cadence.frame(400);
    expect(cadence.finish(420)).toEqual({callbacks:3,maxGapMs:320,trailingGapMs:20});
  });
});
