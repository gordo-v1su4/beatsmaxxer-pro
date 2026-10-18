import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('$lib/platform/tauriInvoke', () => ({ tauriInvoke: invoke }));
import { hostedApiFetch, hostedDemoFetch } from '$lib/platform/hostedApi';
import { fetchAccessState, submitPin } from '$lib/access/accessGate';
beforeEach(() => {
  invoke.mockReset();
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {}, location: { href: 'http://tauri.localhost/', origin: 'http://tauri.localhost' } });
});
afterEach(() => vi.unstubAllGlobals());
it('downloads desktop demo assets through binary IPC without text conversion',async()=>{
  const bytes=new Uint8Array([0,255,128,42]);invoke.mockResolvedValue(bytes.buffer);
  const response=await hostedDemoFetch('/demo-media/'+'a'.repeat(64)+'.mp4');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(invoke).toHaveBeenCalledWith('hosted_demo_request',{path:'/demo-media/'+'a'.repeat(64)+'.mp4'});
});
it('uses native session for access status and PIN, preserving rejection status', async () => {
  invoke.mockResolvedValueOnce({status:200,body:'{"required":true,"unlocked":false}'})
    .mockResolvedValueOnce({status:401,body:'{}'}).mockResolvedValueOnce({status:200,body:'{}'});
  expect(await fetchAccessState()).toBe('locked');
  expect(await submitPin('bad')).toBe('rejected');
  expect(await submitPin('test-code')).toBe('accepted');
  expect(invoke.mock.calls[0][1].path).toBe('/__api/gate');
  expect(JSON.parse(new TextDecoder().decode(new Uint8Array(invoke.mock.calls[2][1].body)))).toEqual({pin:'test-code'});
});
it('preserves multipart bytes and boundary for chunk uploads', async () => {
  invoke.mockResolvedValue({status:200,body:'{"ok":true}'});
  const form = new FormData(); form.set('file', new Blob([new Uint8Array([0,255,128,42])]), '00000.part');
  await hostedApiFetch('/__api/media/upload?uploadId=fixture&chunkIndex=0', {method:'POST',body:form});
  const request = invoke.mock.calls[0][1];
  expect(request.contentType).toMatch(/^multipart\/form-data; boundary=/);
  const parsed = await new Response(new Uint8Array(request.body), {headers:{'Content-Type':request.contentType}}).formData();
  expect(Array.from(new Uint8Array(await (parsed.get('file') as File).arrayBuffer()))).toEqual([0,255,128,42]);
});
it('preserves worker failure status and refuses an already canceled request', async () => {
  invoke.mockResolvedValue({status:503,body:'{"detail":"Worker unavailable"}'});
  expect((await hostedApiFetch('/__api/media/jobs/'+'a'.repeat(64))).status).toBe(503);
  invoke.mockClear();
  await expect(hostedApiFetch('/__api/gate',{signal:AbortSignal.abort()})).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
});
it('leaves browser requests on their existing fetch path', async () => {
  vi.stubGlobal('window', {location:{origin:'https://app.test'}});
  const fetcher=vi.fn(async()=>Response.json({ok:true}));vi.stubGlobal('fetch',fetcher);
  await hostedApiFetch('/__api/media/jobs', {method:'POST',body:'{}'});
  expect(fetcher).toHaveBeenCalledWith('/__api/media/jobs',{method:'POST',body:'{}'});
  expect(invoke).not.toHaveBeenCalled();
});
it('cancels waiting for native I/O immediately, discarding a later response', async () => {
  let complete!:(result:{status:number;body:string})=>void;
  invoke.mockImplementation(()=>new Promise(resolve=>complete=resolve));
  const abort=new AbortController();
  const result=hostedApiFetch('/__api/gate',{signal:abort.signal});
  await vi.waitFor(()=>expect(invoke).toHaveBeenCalledOnce());
  abort.abort();await expect(result).rejects.toThrow();
  complete({status:200,body:'{}'});
});
