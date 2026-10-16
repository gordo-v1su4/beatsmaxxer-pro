import { afterEach, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMediaProxy } from '../../../../api/media/index';
import { ACCESS_COOKIE_NAME, mintSessionToken } from '../../../../api/gate/policy';
import { workerToken } from '../../../../media-worker/auth';
import { createHash } from 'node:crypto';
import catalog from '../../../src/lib/runtime/publicDemo.json';
import { INTERPOLATION_PROFILE } from '../../../../api/_lib/interpolationContract';

const env={NODE_ENV:'production',APP_ACCESS_PIN:'test-pin',INTERPOLATION_WORKER_URL:'https://worker.invalid/',MEDIA_GATEWAY_URL:'https://media.invalid',MEDIA_GATEWAY_TOKEN:'fixture-gateway-token',MEDIA_GATEWAY_BUCKET:'beatsmaxxer-pro',MEDIA_GATEWAY_USER_ID:'beatsmaxxer-pro'};
const id='a'.repeat(64);
function request(body='',method='GET',headers:Record<string,string>={}){
 return Object.assign(Readable.from(body?[Buffer.from(body)]:[]),{method,url:'/__api/media/jobs/'+id,headers:{host:'beats.test',origin:'https://beats.test','x-forwarded-proto':'https','sec-fetch-site':'same-origin',cookie:`${ACCESS_COOKIE_NAME}=${mintSessionToken({pin:env.APP_ACCESS_PIN})}`,...headers}}) as unknown as IncomingMessage;
}
function response(){
 const res={statusCode:200,destroyed:false,writableEnded:false,headers:{} as Record<string,string>,body:'',setHeader(name:string,value:string){this.headers[name]=value;},end(body:string){this.body=body;this.writableEnded=true;}};
 return res;
}
afterEach(()=>vi.unstubAllGlobals());
const demoClip = catalog.clips[0];
const demoId = createHash('sha256').update(`${INTERPOLATION_PROFILE}:${demoClip.sha256}`).digest('hex');
const demoJob = () => ({ id: demoId, state: 'ready', profile: INTERPOLATION_PROFILE,
 source: {sha256: demoClip.sha256, uploadId:'private-upload-id'},
 artifact:{fps:96,factor:4,duration:1,model:'rife-v4.6',engine:'rife-cuda-nvcodec-2.2.3',frames:96,sourceFps:24,width:320,height:180,objectKey:'demo-render.mp4',url:'https://media.invalid/demo.mp4',sha256:'b'.repeat(64)} });
it('allows only an approved ready demo render without a session, stripping upload metadata',async()=>{
 const fetcher=vi.fn(async()=>Response.json(demoJob()));vi.stubGlobal('fetch',fetcher);const res=response();
 await handleMediaProxy(request('','GET',{cookie:''}),res as unknown as ServerResponse,'demo/jobs/'+demoId,env);
 expect(res.statusCode).toBe(200);expect(JSON.parse(res.body).source).toEqual({sha256:demoClip.sha256,name:demoClip.name,size:demoClip.size});
 expect(res.body).not.toContain('private-upload-id');expect(fetcher.mock.calls).toHaveLength(1);
});
it.each(['demo/jobs/'+id,'demo/jobs/'+demoId+'/retry','demo/jobs'])('denies anonymous access outside the curated read route: %s',async path=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const res=response();
 await handleMediaProxy(request('','GET',{cookie:''}),res as unknown as ServerResponse,path,env);
 expect(res.statusCode).toBe(401);expect(fetcher).not.toHaveBeenCalled();
});
it('never submits demo jobs through the public route',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const res=response();
 await handleMediaProxy(request('{}','POST',{cookie:''}),res as unknown as ServerResponse,'demo/jobs/'+demoId,env);
 expect(res.statusCode).toBe(401);expect(fetcher).not.toHaveBeenCalled();
});
it.each(['wrong-source','not-ready','wrong-profile','invalid-artifact'])('rejects an unverified cached demo result: %s',async kind=>{
 const job=demoJob();if(kind==='wrong-source')job.source.sha256='a'.repeat(64);if(kind==='not-ready')job.state='processing';
 if(kind==='wrong-profile')job.profile='old';if(kind==='invalid-artifact')job.artifact.fps=24;
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(job)));const res=response();
 await handleMediaProxy(request('','GET',{cookie:''}),res as unknown as ServerResponse,'demo/jobs/'+demoId,env);
 expect(res.statusCode).toBe(503);expect(res.body).not.toContain('private-upload-id');
});
it('denies cross-origin requests before contacting the worker',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const res=response();
 await handleMediaProxy(request('', 'GET',{origin:'https://elsewhere.test'}),res as unknown as ServerResponse,'jobs/'+id,env);
 expect(res.statusCode).toBe(403);expect(fetcher).not.toHaveBeenCalled();
});
it('requires the access session before exposing job metadata',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const res=response();
 await handleMediaProxy(request('', 'GET',{cookie:''}),res as unknown as ServerResponse,'jobs/'+id,env);
 expect(res.statusCode).toBe(401);expect(fetcher).not.toHaveBeenCalled();
});
it('forwards only a purpose-specific worker credential and returns no gateway credential',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({id,state:'ready'})));vi.stubGlobal('fetch',fetcher);const res=response(),req=request();
 await handleMediaProxy(req,res as unknown as ServerResponse,'jobs/'+id,env);
 expect(res.statusCode).toBe(200);expect(res.body).not.toContain(env.MEDIA_GATEWAY_TOKEN);
 expect(fetcher).toHaveBeenCalledWith('https://worker.invalid/jobs/'+id,expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer '+workerToken(env.MEDIA_GATEWAY_TOKEN)})}));
 expect(req.listenerCount('aborted')).toBe(0);
});
it.each(['health','jobs','jobs/'+id+'/anything','jobs/../../health'])('denies unsupported GET route %s',async(path)=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const res=response();
 await handleMediaProxy(request(),res as unknown as ServerResponse,path,env);expect(res.statusCode).toBe(404);expect(fetcher).not.toHaveBeenCalled();
});
it('bounds job JSON before submitting expensive GPU work',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const res=response();
 await handleMediaProxy(request('x'.repeat(65537),'POST'),res as unknown as ServerResponse,'jobs',env);
 expect(res.statusCode).toBe(413);expect(fetcher).not.toHaveBeenCalled();
});
it('rejects malformed submission JSON',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const res=response();
 await handleMediaProxy(request('{','POST'),res as unknown as ServerResponse,'jobs',env);
 expect(res.statusCode).toBe(400);expect(fetcher).not.toHaveBeenCalled();
});
it('turns a proxy outage into a useful retry message without exposing upstream HTML',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>upstream unavailable</html>',{status:502})));const res=response();
 await handleMediaProxy(request(),res as unknown as ServerResponse,'jobs/'+id,env);
 expect(res.statusCode).toBe(502);expect(JSON.parse(res.body).detail).toContain('unavailable');expect(res.body).not.toContain('<html>');
});
it('allows POST on the exact retry endpoint',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({id,state:'queued'})));vi.stubGlobal('fetch',fetcher);const res=response();
 await handleMediaProxy(request('{}','POST'),res as unknown as ServerResponse,'jobs/'+id+'/retry',env);
 expect(res.statusCode).toBe(200);expect(fetcher).toHaveBeenCalledWith('https://worker.invalid/jobs/'+id+'/retry',expect.objectContaining({method:'POST',body:'{}'}));
});
