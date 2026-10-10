import { Input, ALL_FORMATS, BlobSource } from 'mediabunny';
import { writable, derived } from 'svelte/store';
import { timingActive, timingStatus,timingCacheCapacity,timingSceneErrors } from '$lib/stores/timing';
import { timingPreparationBlocked } from './readiness';
import { INTERPOLATION_PROFILE, validInterpolationArtifact, type InterpolationJob, type InterpolationArtifact } from '../../../../../api/_lib/interpolationContract';
import { rememberGeneratedInterpolation, meetsSlowMotionFrameRate } from './interpolation';

export interface PreparationProgress { stage:string; completed:number; total:number; jobId?:string }
export interface SlotPreparation extends PreparationProgress { state:'working'|'failed'; name:string; original:File; error?:string }
export const slotPreparation=writable<Record<string,SlotPreparation>>({});
derived([timingActive,slotPreparation,timingStatus,timingCacheCapacity,timingSceneErrors],([active,preparing,status,cache,errors])=>active&&(Object.keys(preparing).length>0||Object.values(status).some(s=>s.state!=='ready')||cache.pending>0||Object.keys(errors).length>0)).subscribe(timingPreparationBlocked.set);
export function clearSlotPreparation(slot:string){slotPreparation.update(states=>{const next={...states};delete next[slot];return next;});}
const files=new WeakMap<File,Promise<File>>(), originals=new WeakMap<File,File>();
const preparedFiles=new WeakMap<File,File>();
export const preparedSlowMotionFile=(file:File)=>preparedFiles.get(file)??null;
const fileProgress=new WeakMap<File,{progress:PreparationProgress;listeners:Set<(p:PreparationProgress)=>void>}>();
type Render={blob:Blob;artifact:InterpolationArtifact};
const renders=new Map<string,{promise:Promise<Render>;progress:PreparationProgress;listeners:Set<(p:PreparationProgress)=>void>}>();
export const originalSlowMotionFile=(file:File)=>originals.get(file)??file;
const digest=async(bytes:BufferSource)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function videoFps(file:File){
  const input=new Input({formats:ALL_FORMATS,source:new BlobSource(file)});
  try{const track=await input.getPrimaryVideoTrack();if(!track)throw new Error('This clip has no video track');return (await track.computePacketStats()).averagePacketRate;}
  finally{input.dispose();}
}
async function readJob(response:Response,expectedId:string,sourceHash:string){
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.detail||`Media processing failed (${response.status})`);
  if(!data||data.id!==expectedId||data.source?.sha256!==sourceHash||data.profile!==INTERPOLATION_PROFILE||!['queued','processing','ready','failed'].includes(data.state))throw new Error('Worker returned unexpected clip metadata');
  return data as InterpolationJob;
}
async function createRender(file:File,sha256:string,id:string,notify:(p:PreparationProgress)=>void):Promise<Render>{
  const path=`/__api/media/jobs/${id}`;
  let response=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(30000)});
  let job:InterpolationJob;
  if(response.status===404){
    const uploadId=crypto.randomUUID(),chunkBytes=3*1024*1024,chunkCount=Math.ceil(file.size/chunkBytes);
    for(let i=0;i<chunkCount;i++){
      notify({stage:'uploading',completed:i,total:chunkCount,jobId:id});
      const form=new FormData();form.set('file',file.slice(i*chunkBytes,(i+1)*chunkBytes),`${String(i).padStart(5,'0')}.part`);
      const url=new URL('/__api/media/upload',window.location.origin);url.searchParams.set('uploadId',uploadId);url.searchParams.set('chunkIndex',String(i));
      const uploaded=await fetch(url,{method:'POST',body:form,signal:AbortSignal.timeout(120000)});
      if(!uploaded.ok){const error=await uploaded.json().catch(()=>null);throw new Error(error?.detail||'Clip upload failed');}
    }
    response=await fetch('/__api/media/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha256,name:file.name,uploadId,chunkCount,size:file.size}),signal:AbortSignal.timeout(30000)});
  }
  job=await readJob(response,id,sha256);
  const deadline=Date.now()+45*60000;
  while(job.state!=='ready'){
    notify({stage:job.stage,completed:job.completed,total:job.total,jobId:id});
    if(job.state==='failed')throw new Error(job.error||'GPU interpolation failed');
    if(Date.now()>deadline)throw new Error('GPU preparation timed out. Retry the clip.');
    await new Promise(resolve=>setTimeout(resolve,1000));
    job=await readJob(await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(30000)}),id,sha256);
  }
  const artifact=job.artifact;
  if(!validInterpolationArtifact(artifact))throw new Error('The render has no verified interpolation provenance');
  notify({stage:'downloading-render',completed:0,total:1,jobId:id});
  const download=await fetch(artifact.url,{signal:AbortSignal.timeout(120000)});
  if(!download.ok)throw new Error('The prepared clip could not be downloaded');
  const bytes=await download.arrayBuffer();
  if(await digest(bytes)!==artifact.sha256)throw new Error('The prepared clip failed its content-hash check');
  const blob=new Blob([bytes],{type:'video/mp4'}),rendered=new File([blob],file.name,{type:'video/mp4'});
  const fps=await videoFps(rendered);
  if(Math.abs(fps-artifact.fps)>.1)throw new Error('The prepared clip has an unexpected frame rate');
  rememberGeneratedInterpolation(artifact.sha256,artifact.factor);
  notify({stage:'preparing-frames',completed:1,total:1,jobId:id});
  return {blob,artifact};
}

/** Downloads once, verifies the bytes, then gives local media to the resident renderer. */
export async function prepareSlowMotionFile(file:File,notify:(p:PreparationProgress)=>void):Promise<File>{
  notify({stage:'checking-clip',completed:0,total:0});
  const already=files.get(file);
  const observed=fileProgress.get(file);
  if(already&&observed){observed.listeners.add(notify);notify(observed.progress);try{return await already;}finally{observed.listeners.delete(notify);}}
  const state={progress:{stage:'checking-clip',completed:0,total:0} as PreparationProgress,listeners:new Set([notify])};
  fileProgress.set(file,state);
  const publish=(p:PreparationProgress)=>{state.progress=p;for(const listener of state.listeners)listener(p);};
  const prepare=(async()=>{
    if(meetsSlowMotionFrameRate(await videoFps(file))){preparedFiles.set(file,file);return file;}
    const sha=await digest(await file.arrayBuffer()),id=await digest(new TextEncoder().encode(`${INTERPOLATION_PROFILE}:${sha}`));
    let entry=renders.get(sha);
    if(!entry){
      const listeners=new Set<(p:PreparationProgress)=>void>();
      entry={listeners,progress:{stage:'queued',completed:0,total:0,jobId:id},promise:undefined!};
      const current=entry;
      current.promise=createRender(file,sha,id,p=>{current.progress=p;for(const listener of current.listeners)listener(p);}).catch(error=>{renders.delete(sha);throw error;});
      renders.set(sha,current);
    }
    entry.listeners.add(publish);publish(entry.progress);
    try{
      const render=await entry.promise;
      const prepared=new File([render.blob],file.name,{type:'video/mp4',lastModified:file.lastModified});
      originals.set(prepared,file);preparedFiles.set(file,prepared);return prepared;
    }finally{entry.listeners.delete(publish);}
  })();
  files.set(file,prepare);
  try{return await prepare;}catch(error){files.delete(file);fileProgress.delete(file);throw error;}finally{state.listeners.delete(notify);}
}
export async function retrySlotPreparation(slot:string,entry:SlotPreparation){
  if(entry.jobId){
    const path=`/__api/media/jobs/${entry.jobId}`;
    const current=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(current.status!==404){
      if(!current.ok)throw new Error('The GPU worker is unavailable. Retry shortly.');
      const job=await current.json();
      if(job.id!==entry.jobId||!['queued','processing','ready','failed'].includes(job.state))throw new Error('The GPU job could not be verified');
      // Network/download failures may leave an already completed server job.
      // Resume that job; only explicitly failed GPU executions need requeuing.
      if(job.state==='failed'){
        const response=await fetch(`${path}/retry`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw new Error('The GPU job could not be retried');
      }
    }
  }
  const {mediaRuntime}=await import('$lib/runtime/media/MediaRuntime');
  return mediaRuntime.registerModuleFileClip(slot,entry.original);
}
