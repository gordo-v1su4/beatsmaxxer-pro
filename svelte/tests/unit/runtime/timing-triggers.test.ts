import { describe,it,expect } from 'vitest';
import { buildTimingSchedule,sampleTimingSchedule,defaultTimingTrigger,stutterBoundaries,type TimingSignal } from '$lib/runtime/timing/triggers';
import { defaultClipTiming,evaluateRamp } from '$lib/runtime/timing/envelope';
import { rampPreset,scaleRampRange,rampRange } from '$lib/runtime/timing/rampPresets';
import { residentDimensions } from '$lib/runtime/timing/ResidentFrameBank';
import { buildSchedule,targetAt } from '$lib/qa/benchmark/schedule';
import { parseTimingSettings } from '$lib/stores/timing';

const signal:TimingSignal={label:'test MIDI',bpm:120,beats:Array.from({length:201},(_,i)=>i*.5),duration:100,channels:[{name:'vocals',events:Array.from({length:120},(_,i)=>({time:.1+i*.37,strength:1}))}]};
describe('finite musical Timing effects',()=>{
  it('matches the saved R&D ramp schedule and source mapping for each independent slot',()=>{
    const trigger={...defaultTimingTrigger(),source:'midi' as const,threshold:0};
    const reference=buildSchedule({...signal,beats:[...signal.beats],triggerChannels:signal.channels},Array(10).fill(100),42,100,'speed-ramp');
    for(let slot=0;slot<10;slot++){
      const config=defaultClipTiming();config.ramp=rampPreset('COSINE');
      const actual=buildTimingSchedule(config,trigger,signal,slot,100);
      expect(actual.bursts.map(b=>b.at)).toEqual(reference[slot].filter(e=>e.rampPeriod).map(e=>e.at));
      for(const time of [0,.1,.3,1,2,4,8,15,25,40,70]){
        const a=sampleTimingSchedule(actual,time),b=targetAt(reference[slot],time,100);
        expect(a.sourceSeconds).toBeCloseTo(b.source,8);expect(a.rate).toBeCloseTo(b.rate,8);
      }
    }
  });
  it('matches R&D MIDI stutter slice choices, repeats and normal play after the burst',()=>{
    const config=defaultClipTiming('top-1');config.stutter.mode='jump';
    const trigger={...defaultTimingTrigger(),source:'midi' as const,threshold:0,gapSeconds:0};
    const reference=buildSchedule({...signal,beats:[...signal.beats],triggerChannels:signal.channels},Array(10).fill(20),42,100,'midi-stems');
    for(let slot=0;slot<10;slot++){
      const actual=buildTimingSchedule(config,trigger,signal,slot,20);
      // R&D stutter preroll uses the same deck offset.
      for(const time of [0,.1,.26,.36,.65,1.099,1.11,2.03,5,10,25,40])expect(sampleTimingSchedule(actual,time).sourceSeconds).toBeCloseTo(targetAt(reference[slot],time,20).source,8);
    }
  });
  it('has exact 0/100 percent behavior, coalesces busy notes and enforces the post-burst gap',()=>{
    const c=defaultClipTiming(),t={...defaultTimingTrigger(),source:'midi' as const,rampChance:0};
    expect(buildTimingSchedule(c,t,signal,0,20).bursts).toHaveLength(0);
    t.rampChance=100;t.gapSeconds=.5;
    const plan=buildTimingSchedule(c,t,signal,0,20);
    expect(plan.bursts[0].at).toBe(.1);
    for(let i=1;i<plan.bursts.length;i++)expect(plan.bursts[i].at).toBeGreaterThanOrEqual(plan.bursts[i-1].end+.5-1e-8);
    const b=plan.bursts[0];
    expect(sampleTimingSchedule(plan,b.end+.1).state).toBe('gap');
    expect(sampleTimingSchedule(plan,b.end+.1).rate).toBe(1);
    expect(sampleTimingSchedule(plan,b.end-1e-7).sourceSeconds).toBeCloseTo(sampleTimingSchedule(plan,b.end).sourceSeconds,5);
  });
  it('reconstructs the same source after arbitrary seek order and stays idle for missing data',()=>{
    const p=buildTimingSchedule(defaultClipTiming(),{...defaultTimingTrigger(),source:'midi'},signal,2,20);
    const before=sampleTimingSchedule(p,3.2);sampleTimingSchedule(p,90);sampleTimingSchedule(p,0);
    expect(sampleTimingSchedule(p,3.2)).toEqual(before);
    const missing=buildTimingSchedule(defaultClipTiming(),defaultTimingTrigger(),{...signal,missing:'wrong song'},0,20);
    expect(sampleTimingSchedule(missing,3).rate).toBe(1);expect(missing.bursts).toHaveLength(0);
  });
  it('places swung and dotted repeats at their actual musical boundaries',()=>{
    const stutter=defaultClipTiming('top-1').stutter;
    expect(stutterBoundaries(stutter)).toEqual([0,.5,1,1.5,2]);
    expect(stutterBoundaries({...stutter,groove:'dotted'})).toEqual([0,.75,1.5,2.25,3]);
    const swung=stutterBoundaries({...stutter,groove:'swing'});
    expect(swung[1]).toBeCloseTo(2/3);expect(swung[2]).toBe(1);expect(swung[4]).toBe(2);
    const config=defaultClipTiming('top-1');config.stutter.groove='swing';
    const plan=buildTimingSchedule(config,{...defaultTimingTrigger(),source:'midi',gapSeconds:0},signal,0,20);
    expect(sampleTimingSchedule(plan,.1+1/3).sourceSeconds).toBeCloseTo(.1);
  });
  it('uses the new controls in persisted settings and keeps old curve values',()=>{
    const settings=parseTimingSettings(JSON.stringify({version:1,trigger:{source:'vocals-onsets',rampChance:72,stutterChance:0,gapSeconds:.25,seed:81},preloadHeight:540,clips:{'top-1':{...defaultClipTiming('top-1'),stutter:{...defaultClipTiming('top-1').stutter,groove:'dotted'}}}}));
    expect(settings.trigger.source).toBe('vocals-onsets');expect(settings.trigger.stutterChance).toBe(0);expect(settings.preloadHeight).toBe(540);expect(settings.clips['top-1'].stutter.groove).toBe('dotted');
  });
});
describe('ramp shapes and laptop frames',()=>{
  it('matches the benchmark smash timing and min/max changes actually scale the curve',()=>{
    const smash=rampPreset('SMASH');expect(evaluateRamp(smash,0)).toBe(.25);expect(evaluateRamp(smash,12/16)).toBe(2);expect(evaluateRamp(smash,13/16)).toBe(1);
    const adjusted=scaleRampRange(rampPreset('COSINE'),.25,3);
    expect(rampRange(adjusted)).toEqual({min:.25,max:3});expect(evaluateRamp(adjusted,.5)).toBe(3);
    for(const name of ['UP','DOWN','DIP','S','SLAM'])expect(rampPreset(name).points.length).toBeGreaterThan(2);
  });
  it('reduces only frame dimensions and fits ten 540p banks below 8 GiB',()=>{
    const size=residentDimensions(1280,720,540);expect(size).toEqual({width:960,height:540});
    const counts=[340,352,345,219,346,319,361,361,361,361];
    expect(counts.reduce((a,b)=>a+b,0)*size.width*size.height*4/2**30).toBeCloseTo(6.498455,5);
    expect(residentDimensions(640,360,540)).toEqual({width:640,height:360});
  });
});
