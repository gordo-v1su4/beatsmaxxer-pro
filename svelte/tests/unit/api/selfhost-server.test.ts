import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createServer, request, type Server } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppHandler } from '../../../../runtime/server';

let server:Server, directory:string, origin:string;
beforeEach(async()=>{
  vi.stubEnv('APP_ACCESS_PIN','test-only-access');
  directory=await mkdtemp(join(tmpdir(),'bmx-http-'));
  await writeFile(join(directory,'index.html'),'<main>Browser app</main>');
  await writeFile(join(directory,'app.js'),'window.loaded=true;');
  let handler:ReturnType<typeof createAppHandler>;
  server=createServer((req,res)=>handler(req,res));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No test listener');
  origin=`http://127.0.0.1:${address.port}`;handler=createAppHandler(directory,origin,'test-revision');
});
afterEach(async()=>{vi.unstubAllEnvs();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(directory,{recursive:true,force:true});});

test('serves the portable browser build with correct assets and SPA fallback, without exposing filesystem paths',async()=>{
  expect(await (await fetch(origin+'/')).text()).toContain('Browser app');
  expect(await (await fetch(origin+'/arrange')).text()).toContain('Browser app');
  const asset=await fetch(origin+'/app.js');expect(asset.headers.get('content-type')).toContain('javascript');
  expect((await fetch(origin+'/missing.js')).status).toBe(404);
  expect((await fetch(origin+'/.env')).status).toBe(404);
  expect((await fetch(origin+'/%2e%2e%2fsecret.txt')).status).toBe(404);
  expect((await fetch(origin+'/%ZZ')).status).toBe(400);
});
test('exposes revision health and preserves access-session enforcement and routing boundaries',async()=>{
  expect(await (await fetch(origin+'/health')).json()).toEqual({service:'beatsmaxxer-pro',revision:'test-revision'});
  const gate=await fetch(origin+'/__api/gate');expect(gate.status).toBe(200);
  const media=await fetch(origin+'/__api/media/jobs/'+'a'.repeat(64),{headers:{Origin:origin}});expect(media.status).toBe(401);
  const wrongHost=await new Promise<number|undefined>((resolve,reject)=>{
    const req=request(origin+'/__api/gate',{headers:{Host:'other.example'}},res=>{res.resume();resolve(res.statusCode);});
    req.on('error',reject);req.end();
  });expect(wrongHost).toBe(403);
  expect((await fetch(origin+'/__api/unrecognized')).status).toBe(404);
});
