import {expect,test,vi} from 'vitest';
import {get} from 'svelte/store';
import {TimingRuntime} from '$lib/runtime/timing/TimingRuntime';
import {ResidentFrameBank} from '$lib/runtime/timing/ResidentFrameBank';
import * as preparation from '$lib/runtime/timing/preparation';
import * as interpolation from '$lib/runtime/timing/interpolation';
import {arrangement} from '$lib/stores/arrangement';
import {videoLayers} from '$lib/stores/rack';
import {parseTimingSettings,timingSettings,timingCacheCapacity,timingStatus,timingSceneErrors} from '$lib/stores/timing';

test('prewarms the actual ramp derivative and retains it when its scene is off air',async()=>{
  const original=new File(['original'],'future.mp4'),prepared=new File(['96fps'],'future.mp4');
  const settings=parseTimingSettings(null);
  const runtime=new TimingRuntime();
  const prepare=vi.spyOn(preparation,'prepareSlowMotionFile').mockResolvedValue(prepared);
  const load=vi.spyOn(ResidentFrameBank.prototype,'load').mockResolvedValue();
  const dispose=vi.spyOn(ResidentFrameBank.prototype,'dispose');
  vi.spyOn(ResidentFrameBank.prototype,'stats','get').mockReturnValue({ready:true,frames:1,bytes:1,width:1,height:1,fps:96,duration:1,decoderDisposed:true,decodedFrames:1,uploadedFrames:1,loadMs:0});
  vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(4);
  timingSettings.set(settings);videoLayers.set({});
  arrangement.set([{id:'future',name:'Future',bars:1,deckSnapshot:{timing:settings,scene:{slots:{'top-0':{name:original.name,file:original,url:'blob:original'}}}}}] as never);
  try{
    runtime.setActive(true,{} as GPUDevice);
    await vi.waitFor(()=>expect(load).toHaveBeenCalledWith(prepared,expect.any(Function),0));
    expect(prepare).toHaveBeenCalledWith(original,expect.any(Function));
    expect(load).not.toHaveBeenCalledWith(original,expect.any(Function),0);
    await vi.waitFor(()=>expect(get(timingCacheCapacity).pending).toBe(0));
    videoLayers.set({'top-0':{name:original.name,file:prepared,url:'blob:prepared'}} as never);
    expect(get(timingStatus)['top-0'].state).toBe('ready');
    videoLayers.set({});
    expect(dispose).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledOnce();
  }finally{runtime.dispose();arrangement.set([]);videoLayers.set({});vi.restoreAllMocks();}
});

test.each(['failed','ready'])('retries an off-air section with a %s worker job',async(state)=>{
  const original=new File(['original'],'future-retry.mp4'),prepared=new File(['96fps'],'future-retry.mp4');
  const settings=parseTimingSettings(null),runtime=new TimingRuntime(),jobId='a'.repeat(64);
  const prepare=vi.spyOn(preparation,'prepareSlowMotionFile')
    .mockImplementationOnce(async(_file,notify)=>{notify({stage:'failed',completed:0,total:0,jobId});throw new Error('temporary worker failure');})
    .mockResolvedValue(prepared);
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:jobId,state}),{status:200}));
  vi.stubGlobal('fetch',fetcher);
  vi.spyOn(ResidentFrameBank.prototype,'load').mockResolvedValue();
  vi.spyOn(ResidentFrameBank.prototype,'stats','get').mockReturnValue({ready:true,frames:1,bytes:1,width:1,height:1,fps:96,duration:1,decoderDisposed:true,decodedFrames:1,uploadedFrames:1,loadMs:0});
  vi.spyOn(interpolation,'identifyInterpolation').mockResolvedValue(4);
  timingSettings.set(settings);videoLayers.set({});
  arrangement.set([{id:'future-retry',name:'Future',bars:1,deckSnapshot:{timing:settings,scene:{slots:{'top-0':{name:original.name,file:original,url:'blob:original'}}}}}] as never);
  try{
    runtime.setActive(true,{} as GPUDevice);
    await vi.waitFor(()=>expect(get(timingSceneErrors)[original.name]).toBe('temporary worker failure'));
    await runtime.retryScenes();
    await vi.waitFor(()=>{expect(get(timingSceneErrors)).toEqual({});expect(get(timingCacheCapacity).pending).toBe(0);});
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith(`/__api/media/jobs/${jobId}`,expect.objectContaining({cache:'no-store'}));
    if(state==='failed')expect(fetcher).toHaveBeenCalledWith(`/__api/media/jobs/${jobId}/retry`,expect.objectContaining({method:'POST'}));
    else expect(fetcher).toHaveBeenCalledOnce();
  }finally{runtime.dispose();arrangement.set([]);videoLayers.set({});vi.restoreAllMocks();vi.unstubAllGlobals();}
});
