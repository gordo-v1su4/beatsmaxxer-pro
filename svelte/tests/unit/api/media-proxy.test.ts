import { afterEach, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMediaProxy } from '../../../../api/media/index';
import { ACCESS_COOKIE_NAME, mintSessionToken } from '../../../../api/gate/policy';
import { workerToken } from '../../../../media-worker/auth';

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
