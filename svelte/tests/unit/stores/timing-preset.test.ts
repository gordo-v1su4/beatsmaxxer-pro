import { afterEach,expect,test,vi } from 'vitest';
import { get } from 'svelte/store';
import { timingSettings,parseTimingSettings,saveTimingPreset,loadTimingPreset,readTimingPreset } from '$lib/stores/timing';
const before=get(timingSettings);
afterEach(()=>{vi.unstubAllGlobals();timingSettings.set(before);});
test('explicit preset preserves the chosen vocal MIDI settings independently of transient QA defaults',()=>{
  const storage=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)});
  const settings={...parseTimingSettings(null),preloadHeight:270,trigger:{...before.trigger,source:'midi' as const,channel:'vocals',threshold:0,rampChance:40,density:65,repeatStyle:'energy' as const,gapSeconds:.18}};
  timingSettings.set(settings);saveTimingPreset();
  expect(readTimingPreset()?.trigger).toEqual(settings.trigger);
  timingSettings.set(parseTimingSettings(null));loadTimingPreset();
  expect(get(timingSettings).trigger).toEqual(settings.trigger);
  expect(get(timingSettings).preloadHeight).toBe(270);
});
