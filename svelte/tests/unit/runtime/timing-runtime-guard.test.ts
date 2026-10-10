import { afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { TimingRuntime } from '$lib/runtime/timing/TimingRuntime';
import { ResidentFrameBank } from '$lib/runtime/timing/ResidentFrameBank';
import * as interpolation from '$lib/runtime/timing/interpolation';
import { videoLayers } from '$lib/stores/rack';
import { parseTimingSettings, timingSettings, timingStatus, toggleTimingBypass } from '$lib/stores/timing';
import type { TimelineFrame } from '$lib/transport';
import { pgmSource, queuedPgmSource, markManualCut, selectPgmSource, commitPgmCut, intervalBeats } from '$lib/stores/pgm';
import { rackTop } from '$lib/stores/rack';
import { timingLive } from '$lib/stores/timing';
import * as timingSignals from '$lib/stores/timingSignals';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';

const runtime = new TimingRuntime();
afterEach(() => { runtime.dispose(); videoLayers.set({}); vi.restoreAllMocks(); });

it('keeps a landed manual cut on air through its reset interval during dense MIDI switching',async()=>{
  const settings=parseTimingSettings(null);
  settings.master={...defaultClipTiming(),effect:'stutter'};
  settings.clips={'top-0':{...defaultClipTiming(),effect:'stutter'},'top-1':{...defaultClipTiming(),effect:'stutter'}};
  settings.trigger={...settings.trigger,source:'midi',threshold:0,density:100,gapSeconds:.12};
  timingSettings.set(settings);intervalBeats.set(4);
  vi.spyOn(timingSignals,'resolveTimingSignal').mockReturnValue({label:'dense notes',bpm:120,beats:[],duration:10,channels:[{name:'drums',events:Array.from({length:80},(_,i)=>({time:i/8,strength:1}))}]});
  vi.spyOn(ResidentFrameBank.prototype,'load').mockImplementation(async function(this:ResidentFrameBank){this.duration=10;});
  vi.spyOn(ResidentFrameBank.prototype,'stats','get').mockReturnValue({ready:true,frames:1,bytes:1,width:10,height:10,fps:24,duration:10,decoderDisposed:true,decodedFrames:1,uploadedFrames:1,loadMs:0});
  vi.spyOn(ResidentFrameBank.prototype,'frameAt').mockReturnValue({view:{} as GPUTextureView,pts:0} as never);
  vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(1);
  videoLayers.set({'top-0':{url:'blob:manual0',name:'zero'},'top-1':{url:'blob:manual1',name:'one'}} as never);
  runtime.setActive(true,{} as GPUDevice);
  await vi.waitFor(()=>expect(get(timingStatus)['top-1']?.state).toBe('ready'));
  const frame=(at:number)=>({positionSeconds:at,beatPosition:at*2,beatIntervalSeconds:.5,fixedStepSeconds:1/60,fixedStepIndex:at*60,fixedStepPhase:0,generation:1,bpm:120,playbackRate:1,playing:true} as TimelineFrame);
  const decks=get(rackTop);commitPgmCut(decks[0]);runtime.tick(frame(0));
  markManualCut();selectPgmSource(decks[1]);runtime.tick(frame(.25));
  expect(get(queuedPgmSource)).toBe(decks[1]);
  commitPgmCut(decks[1]);runtime.tick(frame(.5));
  expect(get(pgmSource)).toBe(decks[1]);
  runtime.tick(frame(2.3));expect(get(pgmSource)).toBe(decks[1]);
  runtime.tick(frame(4.5));expect(get(pgmSource)).toBe(decks[0]);
});

it('PGM SOURCE starts a deck effect on its actual PGM cut rather than a beat interval',async()=>{
  const settings=parseTimingSettings(null);
  settings.scope='global';settings.trigger={...settings.trigger,source:'pgm',threshold:0,rampChance:100};
  timingSettings.set(settings);
  vi.spyOn(ResidentFrameBank.prototype,'load').mockImplementation(async function(this: ResidentFrameBank){this.duration=10;});
  vi.spyOn(ResidentFrameBank.prototype,'stats','get').mockReturnValue({ready:true,frames:1,bytes:1,width:10,height:10,fps:24,duration:10,decoderDisposed:true,decodedFrames:1,uploadedFrames:1,loadMs:0});
  vi.spyOn(ResidentFrameBank.prototype,'frameAt').mockReturnValue({view:{} as GPUTextureView,pts:0} as never);
  vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(1);
  videoLayers.set({'top-0':{url:'blob:pgm0',name:'zero'},'top-1':{url:'blob:pgm1',name:'one'}} as never);
  runtime.setActive(true,{} as GPUDevice);
  await vi.waitFor(()=>expect(get(timingStatus)['top-1']?.state).toBe('ready'));
  const frame=(at:number)=>({positionSeconds:at,beatPosition:at*2,beatIntervalSeconds:.5,fixedStepSeconds:1/60,fixedStepIndex:at*60,fixedStepPhase:0,generation:1,bpm:120,playbackRate:1,playing:true} as TimelineFrame);
  pgmSource.set(get(rackTop)[0]);runtime.tick(frame(0));
  expect(get(timingLive)['top-1'].triggerTime).toBeNull();
  pgmSource.set(get(rackTop)[1]);runtime.tick(frame(.5));
  expect(get(timingLive)['top-1'].triggerTime).toBe(.5);
  runtime.tick(frame(.75));
  expect(get(timingLive)['top-1'].triggerTime).toBe(.5);
});

it('recovers a failed verification through the explicit clip retry action', async () => {
  timingSettings.set(parseTimingSettings(null));
  vi.spyOn(ResidentFrameBank.prototype,'load').mockResolvedValue();
  vi.spyOn(ResidentFrameBank.prototype,'stats','get').mockReturnValue({ready:true,frames:1,bytes:1,width:10,height:10,fps:96,duration:10,decoderDisposed:true,decodedFrames:1,uploadedFrames:1,loadMs:0});
  const verify = vi.spyOn(interpolation,'identifyInterpolation').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(4);
  videoLayers.set({'top-0':{url:'blob:retry-rife',name:'clip'} as never});
  runtime.setActive(true,{} as GPUDevice);
  await vi.waitFor(()=>expect(get(timingStatus)['top-0']?.state).toBe('error'));
  runtime.retry('top-0');
  await vi.waitFor(()=>expect(get(timingStatus)['top-0']?.state).toBe('ready'));
  expect(get(timingStatus)['top-0'].interpolationFactor).toBe(4);
  expect(verify).toHaveBeenCalledTimes(2);
});

it('blocks a clip whose RIFE identity arrives after loading, and recovers on OFF', async () => {
  timingSettings.set({...parseTimingSettings(null),scope:'deck'});
  vi.spyOn(ResidentFrameBank.prototype,'load').mockResolvedValue();
  vi.spyOn(ResidentFrameBank.prototype,'stats','get').mockReturnValue({ready:true,frames:1,bytes:1,width:10,height:10,fps:96,duration:10,decoderDisposed:true,decodedFrames:1,uploadedFrames:1,loadMs:0});
  const select = vi.spyOn(ResidentFrameBank.prototype,'frameAt').mockReturnValue({view:{} as GPUTextureView,pts:0} as never);
  let resolve!: (factor:number)=>void;
  vi.spyOn(interpolation,'identifyInterpolation').mockImplementation(()=>new Promise<number>(r=>resolve=r));
  videoLayers.set({'top-1':{url:'blob:late-rife',name:'clip'} as never});
  runtime.setActive(true,{} as GPUDevice);
  await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
  const frame={positionSeconds:0,beatPosition:0,beatIntervalSeconds:.5,fixedStepSeconds:1/60,fixedStepIndex:0,fixedStepPhase:0,generation:1,bpm:120,playbackRate:1} as TimelineFrame;
  runtime.tick(frame);
  expect(select).not.toHaveBeenCalled();
  resolve(4);
  await vi.waitFor(()=>expect(get(timingStatus)['top-1']?.interpolationFactor).toBe(4));
  runtime.tick(frame);
  expect(select).not.toHaveBeenCalled();
  expect(get(timingStatus)['top-1'].state).toBe('error');
  toggleTimingBypass('top-1');
  runtime.tick(frame);
  expect(get(timingStatus)['top-1'].state).toBe('ready');
  expect(runtime.textureFor('top-1')?.effect).toBe('off');
});
