import { mkdir, rm, rename, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { InterpolationQueue, type InterpolationArtifact, type InterpolationJob } from './queue';
import { workerToken, validWorkerToken } from './auth';
import { mediaGatewayConfigFromEnv, uploadToMediaGateway, fetchGatewayObject, studioChunkObjectKey } from '../api/_lib/mediaGateway';

const gateway=mediaGatewayConfigFromEnv(process.env), token=workerToken(gateway.token);
if(!gateway.url||!gateway.token||!gateway.bucket||!gateway.userId)throw new Error('Media gateway configuration is required');
const root=process.env.WORK_ROOT||'/work';await mkdir(root,{recursive:true});
const queue=new InterpolationQueue(join(root,'jobs.sqlite'),true);
let stopping=false,active:ReturnType<typeof Bun.spawn>|undefined;
let gpuAvailable=false,gpuDevice='';
async function checkGpu(){
  const probe=Bun.spawn([process.env.INTERPOLATION_PYTHON||'/opt/conda/bin/python',join(import.meta.dir,'gpu_health.py')],{stdout:'pipe',stderr:'pipe'});
  const [output]=await Promise.all([new Response(probe.stdout).text(),new Response(probe.stderr).text()]);
  gpuAvailable=await probe.exited===0;
  try{gpuDevice=JSON.parse(output).gpu||'';}catch{gpuAvailable=false;gpuDevice='';}
  return gpuAvailable;
}
await checkGpu();
console.info(JSON.stringify({event:'worker-ready',gpu:gpuDevice,gpuAvailable,queue:'durable-sqlite',gpuConcurrency:1}));
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
Bun.serve({hostname:process.env.WORKER_BIND||'127.0.0.1',port:Number(process.env.PORT||18096),maxRequestBodySize:65536,
  async fetch(req){
    const path=new URL(req.url).pathname;
    if(path==='/health')return json({ok:!stopping&&gpuAvailable,gpuAvailable,gpuDevice,queue:'durable-sqlite',gpuConcurrency:1},gpuAvailable?200:503);
    if(!validWorkerToken(req.headers.get('authorization')?.replace(/^Bearer /,'')||'',token))return json({detail:'Unauthorized'},401);
    try{
      if(path==='/jobs'&&req.method==='POST')return json(queue.submit(await req.json()));
      const match=path.match(/^\/jobs\/([a-f0-9]{64})(\/retry)?$/);
      if(!match)return json({detail:'Unknown job route'},404);
      if(match[2]&&req.method==='POST')return json(queue.retry(match[1]));
      if(!match[2]&&req.method==='GET'){const job=queue.get(match[1]);return job?json(job):json({detail:'Unknown job'},404);}
      return json({detail:'Unsupported method'},405);
    }catch(error){return json({detail:error instanceof Error?error.message:'Invalid request'},400);}
  }
});

async function processJob(job:InterpolationJob){
  if(!await checkGpu())throw new Error('The NVIDIA CUDA GPU is unavailable; CPU interpolation is disabled');
  const directory=join(root,job.id),source=join(directory,'source.mp4'),output=join(directory,'rife4.mp4');
  // A recovered job starts from its immutable staged source, never partial frames.
  await rm(directory,{recursive:true,force:true});await mkdir(directory,{recursive:true});
  const file=await open(source+'.partial','w'),hash=createHash('sha256');let bytes=0;
  try{
    for(let i=0;i<job.source.chunkCount;i++){
      const part=await fetchGatewayObject(gateway,studioChunkObjectKey(gateway.uploadPrefix,job.source.uploadId,i,'video'),{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(120000)})});
      bytes+=part.length;if(bytes>job.source.size)throw new Error('Source size exceeds the submitted file');
      hash.update(part);
      let offset=0;while(offset<part.byteLength){const written=await file.write(part,offset,part.byteLength-offset);if(!written.bytesWritten)throw new Error('Unable to write uploaded clip');offset+=written.bytesWritten;}
      queue.progress(job.id,'downloading',i+1,job.source.chunkCount);
    }
  }finally{await file.close();}
  if(bytes!==job.source.size||hash.digest('hex')!==job.source.sha256)throw new Error('Uploaded source did not match its content hash');
  await rename(source+'.partial',source);
  const date=new Date(job.createdAt),folder=`${gateway.uploadPrefix}/${date.getUTCFullYear()}/${String(date.getUTCMonth()+1).padStart(2,'0')}_${String(date.getUTCDate()).padStart(2,'0')}/${job.id}`;
  queue.progress(job.id,'storing-original',0,1);
  await uploadToMediaGateway(gateway,{folder,filename:'original.mp4',contentType:'video/mp4',body:await Bun.file(source).arrayBuffer(),preserveFilename:true});
  active=Bun.spawn([process.env.INTERPOLATION_PYTHON||'/opt/conda/bin/python',join(import.meta.dir,'pipeline.py'),source,output],{stdout:'pipe',stderr:'pipe',env:process.env});
  const stderrPromise=new Response(active.stderr).text();
  let artifact:Omit<InterpolationArtifact,'objectKey'|'url'>|undefined,error='';
  let text='';
  for await(const chunk of active.stdout){
    text+=new TextDecoder().decode(chunk);
    let newline:number;
    while((newline=text.indexOf('\n'))>=0){
      const line=text.slice(0,newline);text=text.slice(newline+1);
      const payload=JSON.parse(line);
      if(payload.stage){
        if(queue.get(job.id)?.stage!==payload.stage)console.info(JSON.stringify({event:'job-stage',job:job.id,stage:payload.stage}));
        queue.progress(job.id,payload.stage,payload.completed??0,payload.total??0);
      }
      if(payload.artifact)artifact=payload.artifact;
      if(payload.error)error=payload.error;
    }
  }
  const exit=await active.exited,stderr=await stderrPromise;active=undefined;
  if(exit!==0||!artifact)throw new Error(error||stderr.slice(-400)||'Interpolation returned no verified artifact');
  queue.progress(job.id,'storing-render',0,1);
  const stored=await uploadToMediaGateway(gateway,{folder,filename:'rife4.mp4',contentType:'video/mp4',body:await Bun.file(output).arrayBuffer(),preserveFilename:true});
  const completed={...artifact,objectKey:stored.objectKey,url:stored.publicUrl};
  // Durable sidecar lets storage retain provenance independently of queue state.
  await uploadToMediaGateway(gateway,{folder,filename:'interpolation.json',contentType:'application/json',body:new TextEncoder().encode(JSON.stringify({source:job.source,profile:job.profile,artifact:completed})),preserveFilename:true});
  queue.complete(job.id,completed);
  console.info(JSON.stringify({event:'job-ready',job:job.id,fps:completed.fps,frames:completed.frames,engine:completed.engine}));
  await rm(directory,{recursive:true,force:true});
}

async function pump(){
  while(!stopping){
    const job=queue.claim();
    if(!job){await Bun.sleep(500);continue;}
    console.info(JSON.stringify({event:'job-claimed',job:job.id}));
    try{await processJob(job);}catch(error){
      queue.fail(job.id,error instanceof Error?error.message:'Media preparation failed');
      console.error(JSON.stringify({event:'job-failed',job:job.id,error:queue.get(job.id)?.error}));
    }
  }
}
void pump();
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{stopping=true;active?.kill();process.exit(0);});
