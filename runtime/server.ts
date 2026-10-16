import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import gate from '../api/gate/index';
import { handleAnalysisProxy } from '../api/analyze/handler';
import { handleStorageUpload } from '../api/storage/handler';
import { handleMediaProxy } from '../api/media/index';
import { serveDemoMedia } from './demoMedia';

const contentTypes: Record<string, string> = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp',
  '.woff2':'font/woff2','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg',
};
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}

/** The static browser app and its credential-holding proxies share one origin. */
export function createAppHandler(buildRoot: string, origin: string, revision: string) {
  const root=resolve(buildRoot), expected=new URL(origin);
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const path=new URL(req.url??'/',origin).pathname;
      if(path==='/health')return json(res,200,{service:'beatsmaxxer-pro',revision});
      if(path.startsWith('/demo-media/'))return await serveDemoMedia(req,res,process.env.DEMO_MEDIA_ROOT||fileURLToPath(new URL('../svelte/.artifacts/demo-media',import.meta.url)),path.slice('/demo-media/'.length));
      if(path.startsWith('/__api/')) {
        if(req.headers.host?.toLowerCase()!==expected.host.toLowerCase())return json(res,403,{detail:'Unexpected application host.'});
        if(path==='/__api/gate')return await gate(req,res);
        if(path==='/__api/storage/upload')return await handleStorageUpload(req,res);
        if(path.startsWith('/__api/media/'))return await handleMediaProxy(req,res,path.slice('/__api/media/'.length));
        if(path.startsWith('/__api/analyze/'))return await handleAnalysisProxy(req,res,path.slice('/__api/analyze/'.length));
        return json(res,404,{detail:'Unknown application API route.'});
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{detail:'Only GET and HEAD are supported.'});
      let decoded:string;
      try { decoded=decodeURIComponent(path); } catch { return json(res,400,{detail:'Invalid request path.'}); }
      if(decoded.includes('\0')||decoded.split(/[\\/]/).some(part=>part.startsWith('.')))return json(res,404,{detail:'Not found.'});
      let file=resolve(root,'.'+decoded);
      if(file!==root&&!file.startsWith(root+sep))return json(res,404,{detail:'Not found.'});
      let info=await stat(file).catch(()=>null);
      if(!info?.isFile()) {
        // Missing assets are real 404s; only extensionless app routes get the SPA shell.
        if(extname(decoded))return json(res,404,{detail:'Not found.'});
        file=resolve(root,'index.html');info=await stat(file);
      }
      res.writeHead(200,{'Content-Type':contentTypes[extname(file)]??'application/octet-stream',
        'Content-Length':String(info.size),'X-Content-Type-Options':'nosniff',
        'Cache-Control':decoded.startsWith('/_app/immutable/')?'public, max-age=31536000, immutable':'no-cache'});
      if(req.method==='HEAD')return res.end();
      const stream=createReadStream(file);
      stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    } catch(error) {
      console.error('[web] request failed',error instanceof Error?error.name:'Error');
      if(!res.headersSent)json(res,500,{detail:'The request could not be completed.'});else res.destroy();
    }
  };
}

if((import.meta as ImportMeta & {main?:boolean}).main) {
  for(const key of ['APP_ORIGIN','APP_ACCESS_PIN','MEDIA_GATEWAY_TOKEN','INTERPOLATION_WORKER_URL']) {
    if(!process.env[key]?.trim())throw new Error(`Required server setting is absent: ${key}`);
  }
  const port=Number(process.env.PORT??18074);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid server port');
  createServer(createAppHandler(process.env.STATIC_ROOT??'svelte/build',process.env.APP_ORIGIN!,process.env.APP_REVISION??'development'))
    .listen(port,process.env.HOST??'127.0.0.1',()=>console.info('[web] listening',{port,revision:process.env.APP_REVISION??'development'}));
}
