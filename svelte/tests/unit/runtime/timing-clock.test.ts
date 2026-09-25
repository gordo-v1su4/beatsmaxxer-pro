import { describe,expect,it } from 'vitest';
import { advanceClipTiming, timingOutputFrame } from '$lib/runtime/timing/clock';
import { defaultClipTiming,evaluateRamp,rateToY,snapPosition } from '$lib/runtime/timing/envelope';
import { parseTimingSettings } from '$lib/stores/timing';
import { rampPreset } from '$lib/runtime/timing/rampPresets';

const frame=(seconds:number,generation=1)=>({generation,positionSeconds:seconds,beatPosition:seconds*2,beatIntervalSeconds:.5,fixedStepSeconds:1/60,fixedStepIndex:Math.floor(seconds*60),fixedStepPhase:seconds*60-Math.floor(seconds*60)});
describe('production Timing source mapping',()=>{
  it('matches the saved cosine ramp analytically, including sparse frames and repeated cycles',()=>{
    const config=defaultClipTiming();
    config.ramp=rampPreset('COSINE'); // Exact saved R&D curve, separate from the editing default.
    const initial=advanceClipTiming(null,frame(0),config,100);
    for(const t of [.125,.25,.5,.875,1,2.325,13.075]){
      const result=advanceClipTiming(initial.state,frame(t),config,100);
      const expected=1.25*t-.75/(2*Math.PI)*Math.sin(2*Math.PI*t);
      expect(result.sourceSeconds).toBeCloseTo(expected,9);
      expect(result.rate).toBeCloseTo(1.25-.75*Math.cos(2*Math.PI*t),9);
    }
  });
  it('plays a 96fps input at quarter speed with one new source frame for each 24fps output',()=>{
    const config=defaultClipTiming();config.ramp.points=config.ramp.points.map(p=>({...p,y:rateToY(.25)}));
    const initial=advanceClipTiming(null,frame(0),config,20);
    for(let n=1;n<=24;n++)expect(advanceClipTiming(initial.state,frame(n/24),config,20).sourceSeconds).toBeCloseTo(n/96,9);
  });
  it('keeps offset continuous across clip wraps and resets it when seeking',()=>{
    const config=defaultClipTiming();config.ramp.points=config.ramp.points.map(p=>({...p,y:rateToY(.25)}));
    const initial=advanceClipTiming(null,frame(0),config,2);
    const later=advanceClipTiming(initial.state,frame(12),config,2);
    expect(later.sourceSeconds).toBeCloseTo(1);
    expect(later.sourceTimelineSeconds).toBeCloseTo(3);
    expect(later.sourceTimelineSeconds-12).toBeCloseTo(-9);
    expect(advanceClipTiming(later.state,frame(7,2),config,2).sourceTimelineSeconds).toBeCloseTo(7);
  });
  it('keeps quarter-speed output on consecutive source frames despite callback jitter',()=>{
    const config=defaultClipTiming();config.ramp.points=config.ramp.points.map(p=>({...p,y:0}));
    let previous=advanceClipTiming(null,timingOutputFrame(frame(.006),24),config,20).state;
    for(let n=1;n<=48;n++){
      const result=advanceClipTiming(previous,timingOutputFrame(frame(n/24+(n%3)*.005),24),config,20);
      expect(result.sourceSeconds).toBeCloseTo(n/96,9);previous=result.state;
    }
  });
  it('preserves accumulated source across cuts and reanchors on seek generation',()=>{
    const config=defaultClipTiming();let a=advanceClipTiming(null,frame(.013),config,100);
    const b=advanceClipTiming(a.state,frame(.02),config,100);
    expect(b.sourceSeconds-a.sourceSeconds).toBeLessThan(.01);
    a=advanceClipTiming(b.state,frame(2),config,100);
    expect(a.sourceSeconds).not.toBe(2);
    expect(advanceClipTiming(a.state,frame(7,2),config,100).sourceSeconds).toBeCloseTo(7,9);
  });
  it('repeats the stutter phrase, holds an anchor and deterministically revisits jump slices',()=>{
    const config=defaultClipTiming();config.effect='stutter';
    expect(advanceClipTiming(null,frame(.1),config,10).sourceSeconds).toBeCloseTo(.1);
    expect(advanceClipTiming(null,frame(.35),config,10).sourceSeconds).toBeCloseTo(.1);
    config.stutter.mode='hold';expect(advanceClipTiming(null,frame(.35),config,10).sourceSeconds).toBe(0);
    config.stutter.mode='jump';expect(advanceClipTiming(null,frame(3.35,4),config,10,7).sourceSeconds).toBe(advanceClipTiming(null,frame(3.35,12),config,10,7).sourceSeconds);
    const slices=new Set(Array.from({length:8},(_,i)=>Math.floor(advanceClipTiming(null,frame(i+.01),config,10,7).sourceSeconds/10*8)));
    expect(slices.size).toBeGreaterThan(3);
  });
  it('snaps beats and survives malformed saved settings without erasing good slots',()=>{
    expect(snapPosition(.29,'beat',8)).toBe(.25);
    expect(snapPosition(.29,'16th',8)).toBe(.28125);
    const saved=parseTimingSettings(JSON.stringify({version:1,budgetGiB:999,clips:{'top-0':{...defaultClipTiming(),effect:'stutter'},'top-99':defaultClipTiming()}}));
    expect(saved.budgetGiB).toBe(32);expect(saved.clips['top-0'].effect).toBe('stutter');expect(saved.clips['top-99']).toBeUndefined();
    expect(evaluateRamp(defaultClipTiming().ramp,.5)).toBe(2);
  });
});
