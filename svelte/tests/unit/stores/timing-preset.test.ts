import { afterEach,expect,test,vi } from 'vitest';
import { get } from 'svelte/store';
import { timingSettings,parseTimingSettings,saveTimingPreset,loadTimingPreset,readTimingPreset,effectiveClipTiming,timingPgmFollowsTriggers } from '$lib/stores/timing';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';
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

test('legacy saved per-deck curves remain effective while new projects use global defaults',()=>{
  const clip=defaultClipTiming('top-0');clip.ramp.cycleBeats=8;clip.stutter.repeats=11;
  const legacy=parseTimingSettings(JSON.stringify({version:1,clips:{'top-0':clip}}));
  expect(legacy.scope).toBe('deck');
  expect(effectiveClipTiming(legacy,'top-0').ramp.cycleBeats).toBe(8);
  expect(effectiveClipTiming(legacy,'top-0').stutter.repeats).toBe(11);
  expect(parseTimingSettings(null).scope).toBe('global');
  expect(parseTimingSettings(JSON.stringify({...legacy,scope:'global'})).scope).toBe('global');
});

test('an empty MIDI deck cannot take PGM ownership from usable Beat decks',()=>{
  const settings=parseTimingSettings(null);settings.scope='deck';
  settings.trigger={...settings.trigger,source:'beat'};
  settings.deckTriggers={'bottom-4':{...settings.trigger,source:'midi'}};
  expect(timingPgmFollowsTriggers(settings,['top-0','top-1'])).toBe(false);
  expect(timingPgmFollowsTriggers(settings,['top-0','bottom-4'])).toBe(true);
  const disabled={...settings,clips:{...settings.clips,'bottom-4':{...defaultClipTiming('bottom-4'),effect:'off' as const}}};
  expect(timingPgmFollowsTriggers(disabled,['top-0','bottom-4'])).toBe(false);
  expect(timingPgmFollowsTriggers(settings,[])).toBe(false);
});
