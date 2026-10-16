import type { IncomingMessage, ServerResponse } from 'node:http';
import { accessGateConfigFromEnv, isAccessGateEnabled, isValidSessionToken, parseCookie, ACCESS_COOKIE_NAME } from '../gate/policy.js';
import { isTrustedSameOriginRequest } from '../analyze/policy.js';
import { handleStorageUpload } from '../storage/handler.js';
import { storageGatewayConfigFromEnv } from '../storage/policy.js';
import { workerToken } from '../../media-worker/auth.js';
import { isPublicDemoJob, publicDemoJob } from './publicDemoJobs.js';

export const config={api:{bodyParser:false},maxDuration:60};
const header=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]:v;
export async function handleMediaProxy(req:IncomingMessage,res:ServerResponse,path:string,env=process.env) {
  const gateway=storageGatewayConfigFromEnv(env);
  if(path==='upload')return handleStorageUpload(req,res,gateway,'video');
  const send=(status:number,data:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
  const gate=accessGateConfigFromEnv(env);
  const demoId = /^demo\/jobs\/([a-f0-9]{64})$/.exec(path)?.[1];
  const publicDemo = req.method === 'GET' && !!demoId && isPublicDemoJob(demoId);
  const context={origin:header(req.headers.origin),host:header(req.headers.host),forwardedProto:header(req.headers['x-forwarded-proto']),fetchSite:header(req.headers['sec-fetch-site']),referer:header(req.headers.referer)};
  if(env.NODE_ENV!=='development'&&!isTrustedSameOriginRequest(context))return send(403,{detail:'Media jobs must come from this application.'});
  if(!publicDemo&&isAccessGateEnabled(gate)&&!isValidSessionToken(parseCookie(header(req.headers.cookie),ACCESS_COOKIE_NAME),gate))return send(401,{detail:'Enter the access code to prepare slow-motion clips.'});
  const allowed=publicDemo||(path==='jobs'?req.method==='POST':/^jobs\/[a-f0-9]{64}$/.test(path)?req.method==='GET':/^jobs\/[a-f0-9]{64}\/retry$/.test(path)&&req.method==='POST');
  if(!allowed)return send(404,{detail:'Unknown media job route.'});
  const base=env.INTERPOLATION_WORKER_URL,token=workerToken(gateway.token);
  if(!base||!token)return send(503,{detail:'Slow-motion worker is not configured.'});
  const abort=new AbortController(),onAbort=()=>abort.abort();req.once('aborted',onAbort);
  try{
    let body:string|undefined;
    if(req.method==='POST'){
      const chunks:Buffer[]=[];let bytes=0;
      for await(const chunk of req){const b=Buffer.from(chunk);bytes+=b.length;if(bytes>65536)return send(413,{detail:'Media job request is too large.'});chunks.push(b);}
      body=Buffer.concat(chunks).toString('utf8')||'{}';
      try{JSON.parse(body);}catch{return send(400,{detail:'Invalid media job request.'});}
    }
    const workerPath = publicDemo ? `jobs/${demoId}` : path;
    const response=await fetch(`${base.replace(/\/+$/,'')}/${workerPath}`,{method:req.method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
    const text=await response.text();
    let payload:unknown;try{payload=JSON.parse(text);}catch{return send(502,{detail:response.ok?'Slow-motion worker returned an invalid response.':'Slow-motion worker is unavailable. Retry shortly.'});}
    if (publicDemo) {
      const approved = response.ok ? publicDemoJob(payload, demoId!) : null;
      return approved ? send(200, approved) : send(503, {detail:'The prepared demo clips are temporarily unavailable. Retry shortly.'});
    }
    return send(response.status,payload);
  }catch{if(!res.destroyed)return send(502,{detail:'Slow-motion worker is unavailable. Retry shortly.'});}
  finally{req.off('aborted',onAbort);}
}
export default async function handler(req:IncomingMessage&{query:{path?:string|string[]}},res:ServerResponse){
  await handleMediaProxy(req,res,header(req.query.path)??'');
}
