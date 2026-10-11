import { afterEach, expect, test, vi } from 'vitest';
import { StreamingFrameSource } from '$lib/runtime/timing/StreamingFrameSource';
import { videoPool } from '$lib/media/VideoPool';
import { webGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import { TimingRuntime } from '$lib/runtime/timing/TimingRuntime';
import { ResidentFrameBank } from '$lib/runtime/timing/ResidentFrameBank';
import { get } from 'svelte/store';
import { timingSettings, parseTimingSettings, timingStatus, timingCacheCapacity } from '$lib/stores/timing';
import { videoLayers } from '$lib/stores/rack';
import { arrangement } from '$lib/stores/arrangement';
import * as interpolation from '$lib/runtime/timing/interpolation';
import type { TimelineFrame } from '$lib/transport';

afterEach(()=>{vi.restoreAllMocks();videoLayers.set({});arrangement.set([]);});

test('an original becomes ready without waiting for a resident ramp upload',async()=>{
  const runtime=new TimingRuntime();
  vi.spyOn(ResidentFrameBank.prototype,'load').mockImplementation(()=>new Promise<void>(()=>{}));
  const streamLoad=vi.spyOn(StreamingFrameSource.prototype,'load').mockResolvedValue();
  vi.spyOn(StreamingFrameSource.prototype,'stats','get').mockReturnValue({ready:true,frames:1,bytes:0,width:1280,height:720,fps:24,duration:12,decoderDisposed:false,metadataDisposed:true,decodedFrames:0,uploadedFrames:0,loadMs:0});
  vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(1);
  timingSettings.set(parseTimingSettings(null));arrangement.set([]);
  videoLayers.set({'top-0':{url:'blob:ramp',name:'ramp'},'top-1':{url:'blob:original',name:'original'}} as never);
  try{
    runtime.setActive(true,{} as GPUDevice);
    await vi.waitFor(()=>expect(get(timingStatus)['top-1']?.state).toBe('ready'));
    expect(get(timingStatus)['top-0']?.state).not.toBe('ready');
    expect(streamLoad).toHaveBeenCalledWith('blob:original');
    expect(get(timingCacheCapacity).usedBytes).toBe(0);
    expect(get(timingStatus)['top-1'].bytes).toBe(0);
  }finally{runtime.dispose();}
});

test('originals decode continuously between repeat boundaries and pause for held slices',()=>{
  const source=new StreamingFrameSource();
  Object.assign(source,{ready:true,duration:12,width:1280,height:720});
  const sync=vi.spyOn(videoPool,'syncControlledModule').mockImplementation(()=>{});
  const view={} as GPUTextureView;
  vi.spyOn(webGpuEngine,'timingVideoFrame').mockReturnValue(view);
  vi.spyOn(videoPool,'get').mockReturnValue({currentTime:2} as HTMLVideoElement);
  const frame=(time:number)=>({positionSeconds:time,contextTimeSeconds:time,generation:1,playing:true,playbackRate:1} as TimelineFrame);
  expect(source.frameAt(2,'top-1',frame(0),1)?.view).toBe(view);
  source.frameAt(2.1,'top-1',frame(.1),1);
  expect(sync.mock.calls[1][4]).toBe(sync.mock.calls[0][4]);
  source.frameAt(2,'top-1',frame(.2),1);
  expect(sync.mock.calls[2][4]).toBeGreaterThan(sync.mock.calls[1][4]!);
  source.frameAt(2,'top-1',frame(.3),0);
  expect(sync.mock.calls[3][3].playing).toBe(false);
  source.frameAt(2.2,'top-1',{...frame(.5),playbackRate:2},1);
  expect(sync.mock.calls[4][2]).toBe(2);
  source.frameAt(2.3,'top-1',{...frame(.6),playbackRate:.5},1);
  expect(sync.mock.calls[5][2]).toBe(.5);
  source.dispose();
});
