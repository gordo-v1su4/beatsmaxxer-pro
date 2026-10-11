import { expect, test } from 'vitest';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';
import { buildTimingSchedule, defaultTimingTrigger, sampleTimingSchedule, type TimingSignal } from '$lib/runtime/timing/triggers';
import { parseTimingSettings } from '$lib/stores/timing';

test('random musical lengths replay identically and never interrupt a running effect', () => {
  const config=defaultClipTiming();
  config.ramp={...config.ramp,cycleMode:'random',cycleChoices:[1,2,4,8]};
  const signal:TimingSignal={label:'vocals',bpm:120,duration:100,beats:[],channels:[{name:'vocals',events:Array.from({length:1000},(_,i)=>({time:i*.1,strength:1}))}]};
  const trigger={...defaultTimingTrigger(),source:'midi' as const,channel:'vocals',rampChance:100,threshold:0,gapSeconds:.18};
  const plan=buildTimingSchedule(config,trigger,signal,0,20);
  expect(buildTimingSchedule(structuredClone(config),trigger,signal,0,20)).toEqual(plan);
  const lengths=new Set(plan.bursts.map(b=>Math.round((b.end-b.at)*2)));
  expect(lengths).toEqual(new Set([1,2,4,8]));
  for(let i=0;i<plan.bursts.length;i++){
    const burst=plan.bursts[i];
    expect(sampleTimingSchedule(plan,(burst.at+burst.end)/2).phase).toBeCloseTo(.5);
    if(i)expect(burst.at).toBeGreaterThanOrEqual(plan.bursts[i-1].blockedUntil-1e-8);
  }
});

test('saved cycle choices survive settings and take snapshots with invalid values removed', () => {
  const config=defaultClipTiming();config.ramp={...config.ramp,cycleMode:'random',cycleChoices:[1,2,4,8]};
  const saved=parseTimingSettings(JSON.stringify({version:1,master:config}));
  expect(saved.master?.ramp.cycleMode).toBe('random');
  expect(saved.master?.ramp.cycleChoices).toEqual([1,2,4,8]);
  const malformed=parseTimingSettings(JSON.stringify({version:1,clips:{'top-0':{...config,ramp:{...config.ramp,cycleChoices:[0,-1,'4',4,99]}}}}));
  expect(malformed.clips['top-0'].ramp.cycleChoices).toEqual([4]);
});
