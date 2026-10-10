import { afterEach, describe, expect, test } from 'vitest';
import { get } from 'svelte/store';
import { arrangement, resetArrangement } from '$lib/stores/arrangement';
import { timingSettings, setTimingTrigger, effectiveTimingTrigger } from '$lib/stores/timing';
import { setArrangementMode } from '$lib/arrangement/transportMode';
import { captureTakeSection, applyTakeSection } from '$lib/arrangement/takeSnapshot';
import { viewMode, playbackWorkspace } from '$lib/stores/rackUi';
import { buildTimingSchedule, sampleTimingSchedule, defaultTimingTrigger } from '$lib/runtime/timing/triggers';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';
import { videoLayers } from '$lib/stores/rack';

afterEach(()=>{setArrangementMode('live',0);viewMode.set('perform');resetArrangement();});
describe('section take reproduction',()=>{
  test('records the actual rack when a planned section clip is unavailable',()=>{
    const previous=get(videoLayers);
    try{
      resetArrangement();
      const section=get(arrangement)[0];
      arrangement.set([{...section,timeStartS:0,timeEndS:4,scene:{slots:{'top-0':{name:'missing-planned.mp4',url:'blob:missing'}}}}]);
      videoLayers.set({'top-0':{name:'actual-on-air.mp4',url:'blob:actual'}} as never);
      captureTakeSection(1,120);
      expect(get(arrangement)[0].deckSnapshot?.scene.slots['top-0']?.name).toBe('actual-on-air.mp4');
      expect(get(arrangement)[0].scene?.slots['top-0']?.name).toBe('missing-planned.mp4');
    }finally{videoLayers.set(previous);}
  });
  test('same snapshot, seed and song position reproduce ramps and jump slices after seeks',()=>{
    const signal={label:'MIDI',beats:[],bpm:120,duration:30,channels:[{name:'drums',events:Array.from({length:30},(_,i)=>({time:i,strength:(i%10+1)/10}))}]};
    const trigger={...defaultTimingTrigger(),source:'midi' as const,density:70,repeatStyle:'energy' as const,threshold:0};
    for(const slot of ['top-0','top-1']){
      const config=defaultClipTiming(slot);config.stutter.mode='jump';
      const first=buildTimingSchedule(config,trigger,signal,3,12);
      const replay=buildTimingSchedule(structuredClone(config),structuredClone(trigger),signal,3,12);
      for(const at of [0,.5,9.12,3.25,17.3,1])expect(sampleTimingSchedule(replay,at)).toEqual(sampleTimingSchedule(first,at));
    }
  });
  test('keeps distinct section settings, locks edits, and restores the live workspace on exit',()=>{
    resetArrangement();viewMode.set('timing');viewMode.set('arrange');playbackWorkspace.set('timing');
    const base=get(arrangement)[0];
    arrangement.set([{...base,id:'verse',timeStartS:0,timeEndS:4},{...base,id:'chorus',timeStartS:4,timeEndS:8}]);
    timingSettings.update(s=>({...s,scope:'global',trigger:{...s.trigger,seed:11}}));
    const live=structuredClone(get(timingSettings));
    setArrangementMode('rec',0);
    setTimingTrigger({seed:999});expect(get(timingSettings).trigger.seed).toBe(11);
    setArrangementMode('live',3);
    setTimingTrigger({seed:22});captureTakeSection(5,120);
    expect(get(arrangement)[0].deckSnapshot?.timing.trigger.seed).toBe(11);
    expect(get(arrangement)[1].deckSnapshot?.timing.trigger.seed).toBe(22);
    setArrangementMode('play',0);
    expect(effectiveTimingTrigger(get(timingSettings),'top-0').seed).toBe(11);
    applyTakeSection(get(arrangement)[1]);expect(get(timingSettings).trigger.seed).toBe(22);
    applyTakeSection(get(arrangement)[0]);expect(get(timingSettings).trigger.seed).toBe(11);
    viewMode.set('timing');expect(get(timingSettings).trigger.seed).toBe(22);
    expect(live.trigger.seed).toBe(11);
  });
});

test('replays musical settings without increasing the current GPU cache budget or changing output FPS',()=>{
 resetArrangement();viewMode.set('timing');playbackWorkspace.set('timing');
 timingSettings.update(s=>({...s,budgetGiB:24,preloadHeight:720,outputFps:60,trigger:{...s.trigger,seed:71}}));
 captureTakeSection(0,120);
 timingSettings.update(s=>({...s,budgetGiB:1,preloadHeight:360,outputFps:24,trigger:{...s.trigger,seed:99}}));
 applyTakeSection(get(arrangement)[0]);
 const settings=get(timingSettings);expect(settings.trigger.seed).toBe(71);expect(settings.budgetGiB).toBe(1);expect(settings.preloadHeight).toBe(360);expect(settings.outputFps).toBe(24);
});
