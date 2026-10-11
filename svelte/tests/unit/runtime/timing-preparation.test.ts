import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { INTERPOLATION_PROFILE } from '../../../../api/_lib/interpolationContract';
vi.mock('mediabunny',()=>({ALL_FORMATS:[],BlobSource:class{constructor(public file:File){}},Input:class{constructor(public options:any){}async getPrimaryVideoTrack(){return {computePacketStats:async()=>({averagePacketRate:(await this.options.source.file.text()).startsWith('render')?95.99999999999997:24})};}dispose(){}}}));
const registration=vi.hoisted(()=>vi.fn(async()=>({status:'success'})));
vi.mock('$lib/runtime/media/MediaRuntime',()=>({mediaRuntime:{registerModuleFileClip:registration}}));
import { prepareSlowMotionFile, preparedSlowMotionFile, slotPreparation, retrySlotPreparation } from '$lib/runtime/timing/preparation';
import { timingActive, timingStatus,timingCacheCapacity,timingSceneErrors } from '$lib/stores/timing';
import { timingPreparationBlocked } from '$lib/runtime/timing/readiness';
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
beforeEach(()=>{timingActive.set(false);timingStatus.set({});slotPreparation.set({});timingCacheCapacity.set({usedBytes:0,requiredBytes:0,pending:0});timingSceneErrors.set({});});
afterEach(()=>vi.unstubAllGlobals());
it.each([90,91,95.9,NaN,Infinity])('rejects worker FPS %s below the 96 FPS contract or non-finite',async(fps)=>{
 const file=new File([`low fps ${fps}`],'clip.mp4'),sha=await hash(await file.text()),id=await hash(`${INTERPOLATION_PROFILE}:${sha}`);
 const artifact={fps,factor:4,duration:1,model:'rife-v4.6',engine:'rife-cuda-nvcodec-2.2.3',frames:96,sourceFps:24,width:1280,height:720,objectKey:'render.mp4',url:'https://media.example/render.mp4',sha256:'a'.repeat(64)};
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({id,source:{sha256:sha},profile:INTERPOLATION_PROFILE,state:'ready',artifact})));
 vi.stubGlobal('fetch',fetcher);
 await expect(prepareSlowMotionFile(file,()=>{})).rejects.toThrow('verified interpolation provenance');
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('shares one verified render and progress between two slots loading the same file',async()=>{
 const file=new File(['original cached clip'], 'clip.mp4',{type:'video/mp4'}),sha=await hash(await file.text()),id=await hash(`${INTERPOLATION_PROFILE}:${sha}`),bytes='render verified clip';
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
 const artifact={fps:96,factor:4,duration:1,model:'rife-v4.6',engine:'rife-cuda-nvcodec-2.2.3',frames:96,sourceFps:24,width:1280,height:720,objectKey:'render.mp4',url:'https://media.example/render.mp4',sha256:await hash(bytes)};
 const fetcher=vi.fn(async(url:string)=>{if(url.startsWith('/__api')){await pending;return new Response(JSON.stringify({id,source:{sha256:sha},profile:INTERPOLATION_PROFILE,state:'ready',artifact}));}return new Response(bytes);});vi.stubGlobal('fetch',fetcher);
 const a:any[]=[],b:any[]=[];const first=prepareSlowMotionFile(file,p=>a.push(p)),second=prepareSlowMotionFile(file,p=>b.push(p));
 expect(preparedSlowMotionFile(file)).toBeNull();
 release();const [one,two]=await Promise.all([first,second]);expect(one).toBe(two);expect(fetcher).toHaveBeenCalledTimes(2);expect(a.some(p=>p.stage==='downloading-render')).toBe(true);expect(b.some(p=>p.stage==='downloading-render')).toBe(true);
 expect(preparedSlowMotionFile(file)).toBe(one);
 // Re-registering a worker result must not submit that 96 FPS file again.
 expect(await prepareSlowMotionFile(one,()=>{})).toBe(one);
 expect(fetcher).toHaveBeenCalledTimes(2);
});
it('GPU failure rejects preparation without returning the base clip',async()=>{
 const file=new File(['original failed GPU'], 'failed.mp4'),sha=await hash(await file.text()),id=await hash(`${INTERPOLATION_PROFILE}:${sha}`);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({id,source:{sha256:sha},profile:INTERPOLATION_PROFILE,state:'failed',stage:'failed',completed:0,total:0,error:'GPU unavailable'}))));
 await expect(prepareSlowMotionFile(file,()=>{})).rejects.toThrow('GPU unavailable');
});
it('blocks transport for failed or working GPU jobs and incomplete local frame banks',()=>{
 timingActive.set(true);expect(get(timingPreparationBlocked)).toBe(false);
 slotPreparation.set({'top-0':{state:'failed',name:'clip',original:new File([],'clip'),stage:'failed',completed:0,total:0,error:'GPU unavailable'}});expect(get(timingPreparationBlocked)).toBe(true);
 slotPreparation.set({});timingStatus.set({'top-0':{state:'loading',frames:1,total:4,bytes:0}});expect(get(timingPreparationBlocked)).toBe(true);
 timingStatus.set({'top-0':{state:'ready',frames:4,total:4,bytes:40,fps:96}});expect(get(timingPreparationBlocked)).toBe(false);
 timingActive.set(false);
});
it('blocks playback while future section banks are preparing or failed',()=>{
 timingActive.set(true);
 timingCacheCapacity.set({usedBytes:0,requiredBytes:0,pending:1});expect(get(timingPreparationBlocked)).toBe(true);
 timingCacheCapacity.set({usedBytes:0,requiredBytes:0,pending:0});expect(get(timingPreparationBlocked)).toBe(false);
 timingSceneErrors.set({'chorus.mp4':'GPU capacity exceeded'});expect(get(timingPreparationBlocked)).toBe(true);
 timingSceneErrors.set({});expect(get(timingPreparationBlocked)).toBe(false);
 timingActive.set(false);
});

it('resumes a completed job after a download failure instead of requeuing it',async()=>{
 const jobId='a'.repeat(64),file=new File(['original'],'clip.mp4');
 const fetcher=vi.fn(async(_url:string)=>new Response(JSON.stringify({id:jobId,state:'ready'})));vi.stubGlobal('fetch',fetcher);registration.mockClear();
 await retrySlotPreparation('top-0',{state:'failed',name:file.name,original:file,stage:'downloading-render',completed:0,total:1,jobId});
 expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe('/__api/media/jobs/'+jobId);expect(registration).toHaveBeenCalledWith('top-0',file);
});
it('requeues an explicitly failed GPU job before registering the clip again',async()=>{
 const jobId='b'.repeat(64),file=new File(['original'],'clip.mp4');
 const fetcher=vi.fn(async(_url:string)=>new Response(JSON.stringify({id:jobId,state:'failed'})));vi.stubGlobal('fetch',fetcher);registration.mockClear();
 await retrySlotPreparation('top-1',{state:'failed',name:file.name,original:file,stage:'failed',completed:0,total:0,jobId});
 expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[1][0]).toBe('/__api/media/jobs/'+jobId+'/retry');expect(registration).toHaveBeenCalledWith('top-1',file);
});
