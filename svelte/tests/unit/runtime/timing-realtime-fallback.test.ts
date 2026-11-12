import { afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { TimingRuntime } from '$lib/runtime/timing/TimingRuntime';
import { StreamingFrameSource } from '$lib/runtime/timing/StreamingFrameSource';
import { ResidentFrameBank } from '$lib/runtime/timing/ResidentFrameBank';
import * as preparation from '$lib/runtime/timing/preparation';
import * as interpolation from '$lib/runtime/timing/interpolation';
import { parseTimingSettings, timingSettings, timingStatus } from '$lib/stores/timing';
import { timingPreparationBlocked } from '$lib/runtime/timing/readiness';
import { videoLayers } from '$lib/stores/rack';
import { arrangement } from '$lib/stores/arrangement';
import { RACK_SLOT_IDS } from '$lib/modules/rackSlots';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';

afterEach(()=>{videoLayers.set({});arrangement.set([]);vi.restoreAllMocks();});

it.each([0,1,12])('plays %i Speedramp decks from originals when interpolation is off',async(count)=>{
  const settings={...parseTimingSettings(null),scope:'deck' as const,gpuInterpolation:false};
  const slots=RACK_SLOT_IDS.slice(0,count);
  for(const slot of slots)settings.clips[slot]={...defaultClipTiming(slot),effect:'ramp'};
  timingSettings.set(settings);arrangement.set([]);
  const load=vi.spyOn(StreamingFrameSource.prototype,'load').mockResolvedValue();
  vi.spyOn(StreamingFrameSource.prototype,'stats','get').mockReturnValue({ready:true,frames:1,bytes:0,width:1,height:1,fps:24,duration:1,decoderDisposed:false,metadataDisposed:true,decodedFrames:0,uploadedFrames:0,loadMs:0});
  const resident=vi.spyOn(ResidentFrameBank.prototype,'load');
  const prepare=vi.spyOn(preparation,'prepareSlowMotionFile');
  vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(1);
  videoLayers.set(Object.fromEntries(slots.map(slot=>[slot,{file:new File(['source'],`${slot}.mp4`),name:slot,url:`blob:${slot}`}])));
  const runtime=new TimingRuntime();
  try{
    runtime.setActive(true,{} as GPUDevice);
    await vi.waitFor(()=>expect(Object.values(get(timingStatus)).filter(s=>s.state==='ready')).toHaveLength(count));
    expect(load).toHaveBeenCalledTimes(count);
    expect(resident).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();
    expect(get(timingPreparationBlocked)).toBe(false);
  }finally{runtime.dispose();}
});

it('persists independent deck switches and falls back without claiming prepared provenance',()=>{
  const settings=parseTimingSettings(JSON.stringify({version:1,gpuInterpolation:true,deckInterpolation:{'top-0':false,'top-1':true,unknown:false}}));
  timingSettings.set(settings);
  expect(settings.deckInterpolation).toEqual({'top-0':false,'top-1':true});
  const file=new File(['source'],'failure.mp4');
  expect(preparation.rampUsesRealtime('top-0',file)).toBe(true);
  expect(preparation.rampUsesRealtime('top-1',file)).toBe(false);
  expect(preparation.fallbackSlowMotionFile(file,new Error('worker offline'))).toBe(file);
  expect(preparation.rampUsesRealtime('top-1',file)).toBe(true);
  expect(preparation.preparedSlowMotionFile(file)).toBeNull();
  preparation.clearRealtimeFailure(file);
  expect(preparation.rampUsesRealtime('top-1',file)).toBe(false);
});

 it('honors explicit recorded settings rather than unrelated live interpolation preferences',()=>{
   timingSettings.set({...parseTimingSettings(null),gpuInterpolation:false});
   const snapshot={...parseTimingSettings(null),gpuInterpolation:true};
   expect(preparation.rampUsesRealtime('top-0',undefined,snapshot)).toBe(false);
   expect(preparation.rampUsesRealtime('top-0')).toBe(true);
 });
