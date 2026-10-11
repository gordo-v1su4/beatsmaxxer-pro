import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Database } from 'bun:sqlite';
import { INTERPOLATION_PROFILE } from '../api/_lib/interpolationContract';
import { InterpolationQueue, type InterpolationSource } from './queue';

const source=(hash:string):InterpolationSource=>({sha256:hash.repeat(64),name:'clip.mp4',uploadId:'upload_1234567890',chunkCount:1,size:10});

test('upgrades only valid legacy 96 FPS CUDA renders without a new GPU job or losing provenance',()=>{
  const dir=mkdtempSync(join(tmpdir(),'bmx-profile-')),path=join(dir,'jobs.sqlite');
  try{
    const init=new InterpolationQueue(path);init.close();const db=new Database(path);
    const legacy='rife-v4.6-cuda-nvcodec-min90-v2';
    const artifact={objectKey:'old/rife4.mp4',url:'https://example.test/render.mp4',sha256:'e'.repeat(64),fps:96,sourceFps:24,duration:1,width:1280,height:720,frames:96,factor:4,engine:'rife-cuda-nvcodec-2.2.3',model:'rife-v4.6'};
    for(const [key,render] of [['a',artifact],['b',{...artifact,fps:90}],['c',{...artifact,engine:'rife-ncnn-vulkan'}]] as const){
      const input=source(key),id=createHash('sha256').update(`${legacy}:${input.sha256}`).digest('hex');
      db.query('INSERT INTO jobs VALUES(?,?,?,?)').run(id,'ready',1,JSON.stringify({id,source:input,profile:legacy,state:'ready',stage:'ready',completed:96,total:96,createdAt:1,updatedAt:1,artifact:render}));
    }
    db.close();const q=new InterpolationQueue(path,true);
    const migrated=q.submit(source('a'));expect(migrated.state).toBe('ready');expect(migrated.profile).toBe(INTERPOLATION_PROFILE);expect(migrated.artifact).toEqual(artifact);expect(q.claim()).toBeUndefined();
    expect(q.submit(source('b')).state).toBe('queued');expect(q.submit(source('c')).state).toBe('queued');q.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('rejects sub-96 FPS and non-finite render metadata without completing the job',()=>{
  const q=new InterpolationQueue(':memory:');const job=q.submit(source('d'));q.claim();
  const artifact={objectKey:'render.mp4',url:'https://example.test/render.mp4',sha256:'e'.repeat(64),fps:96,sourceFps:24,duration:1,width:1280,height:720,frames:96,factor:4,engine:'rife-cuda-nvcodec-2.2.3',model:'rife-v4.6'};
  for(const fps of [90,91,95.9,NaN,Infinity]){
    expect(()=>q.complete(job.id,{...artifact,fps})).toThrow('Invalid interpolation artifact');
    expect(q.get(job.id)?.state).toBe('processing');
  }
  for(const invalid of [{duration:NaN},{duration:Infinity},{frames:NaN},{frames:Infinity},{frames:1.5},{factor:4.5},{width:0},{engine:'rife-ncnn-vulkan'}]){
    expect(()=>q.complete(job.id,{...artifact,...invalid})).toThrow('Invalid interpolation artifact');
    expect(q.get(job.id)?.state).toBe('processing');
  }
  q.complete(job.id,artifact);expect(q.get(job.id)?.state).toBe('ready');q.close();
});
test('deduplicates sources and admits one GPU job at a time in FIFO order',()=>{
  const q=new InterpolationQueue(':memory:');
  const first=q.submit(source('a')),second=q.submit(source('b'));
  expect(q.submit({...source('a'),name:'renamed.mp4'}).id).toBe(first.id);
  expect(q.claim()?.id).toBe(first.id);
  expect(q.claim()).toBeUndefined();
  q.fail(first.id,'GPU timeout');
  expect(q.claim()?.id).toBe(second.id);
  expect(()=>q.retry(second.id)).toThrow();
  q.close();
});
test('queue state survives restart and recovers an interrupted job without losing waiting work',()=>{
  const dir=mkdtempSync(join(tmpdir(),'bmx-queue-')),path=join(dir,'jobs.sqlite');
  try{
    let q=new InterpolationQueue(path);const first=q.submit(source('a')),second=q.submit(source('b'));
    q.claim();q.progress(first.id,'interpolating',20,100);q.close();
    q=new InterpolationQueue(path,true);
    expect(q.get(first.id)?.state).toBe('queued');expect(q.get(second.id)?.state).toBe('queued');
    expect(q.claim()?.id).toBe(first.id);expect(q.claim()).toBeUndefined();q.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('failed jobs retry explicitly and completed artifacts are reused after reopening',()=>{
  const dir=mkdtempSync(join(tmpdir(),'bmx-cache-')),path=join(dir,'jobs.sqlite');
  try{
    let q=new InterpolationQueue(path);const job=q.submit(source('a'));q.claim();q.fail(job.id,'timeout');q.retry(job.id);q.claim();
    q.complete(job.id,{objectKey:'media-uploads/clip-rife4.mp4',url:'https://example.test/clip.mp4',sha256:'c'.repeat(64),fps:96,sourceFps:24,duration:1,width:1280,height:720,frames:96,factor:4,engine:'rife-cuda-nvcodec-2.2.3',model:'rife-v4.6'});q.close();
    q=new InterpolationQueue(path,true);expect(q.submit(source('a')).state).toBe('ready');expect(q.claim()).toBeUndefined();q.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
