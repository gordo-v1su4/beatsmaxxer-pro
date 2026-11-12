import { afterEach, expect, test, vi } from 'vitest';
import publishedDemo from '$lib/runtime/publicDemo.json';

const fetcher = vi.hoisted(() => vi.fn());
vi.mock('$lib/platform/hostedApi', async importOriginal => ({ ...await importOriginal<typeof import('$lib/platform/hostedApi')>(), hostedDemoFetch:fetcher }));
import { loadDemoCatalog } from '$lib/runtime/demoCatalog';

afterEach(() => { vi.useRealTimers(); fetcher.mockReset(); });

test('concurrent startup checks share bounded retries and recover a transient native failure', async () => {
  vi.useFakeTimers();
  fetcher.mockRejectedValueOnce('Desktop demo connection failed')
    .mockResolvedValueOnce(new Response('', {status:503}))
    .mockResolvedValueOnce(Response.json(publishedDemo));
  const first=loadDemoCatalog(), second=loadDemoCatalog();
  expect(first).toBe(second);
  const result=Promise.all([first,second]);
  const assertion=expect(result).resolves.toEqual([publishedDemo,publishedDemo]);
  await vi.runAllTimersAsync(); await assertion;
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test('a failed check releases the request so manual retry can succeed', async () => {
  vi.useFakeTimers(); fetcher.mockRejectedValue(new Error('Offline'));
  const failure=expect(loadDemoCatalog()).rejects.toMatchObject({message:expect.stringContaining('unavailable'),cause:expect.objectContaining({message:'Offline'})});
  await vi.runAllTimersAsync(); await failure;
  expect(fetcher).toHaveBeenCalledTimes(3);
  fetcher.mockResolvedValue(Response.json(publishedDemo));
  await expect(loadDemoCatalog()).resolves.toEqual(publishedDemo);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

test('an invalid published bundle fails without retrying validation errors', async () => {
  fetcher.mockResolvedValue(Response.json({...publishedDemo,id:'wrong-bundle'}));
  await expect(loadDemoCatalog()).rejects.toMatchObject({message:'Demo files do not match this version of the app. Please try again later.',retryable:false,cause:expect.objectContaining({message:expect.stringContaining('out of date')})});
  expect(fetcher).toHaveBeenCalledOnce();
});

test('retries a connection interruption after successful response headers', async () => {
  vi.useFakeTimers();
  const interrupted = new Response(new ReadableStream({
    start(controller) { controller.error(new TypeError('Connection interrupted')); }
  }));
  fetcher.mockResolvedValueOnce(interrupted).mockResolvedValueOnce(Response.json(publishedDemo));
  const assertion = expect(loadDemoCatalog()).resolves.toEqual(publishedDemo);
  await vi.runAllTimersAsync();
  await assertion;
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('does not retry malformed JSON after a complete download', async () => {
  fetcher.mockResolvedValue(new Response('{broken'));
  await expect(loadDemoCatalog()).rejects.toThrow('could not be read');
  expect(fetcher).toHaveBeenCalledOnce();
});

test.each([404, 401, 302])('does not retry permanent HTTP %i and releases its body', async status => {
  const response = new Response('unavailable', {status});
  const cancel = vi.spyOn(response.body!, 'cancel');
  fetcher.mockResolvedValue(response);
  await expect(loadDemoCatalog()).rejects.toThrow('unavailable');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
});

test('does not retry native configuration or permanent HTTP failures', async () => {
  fetcher.mockRejectedValue(Object.assign(new Error('Native configuration invalid'), {retryable:false}));
  await expect(loadDemoCatalog()).rejects.toThrow('unavailable');
  expect(fetcher).toHaveBeenCalledOnce();
});

test('bounds stalled catalog attempts and releases the shared check for recovery', async () => {
  vi.useFakeTimers();
  fetcher.mockImplementation((_path:string,signal:AbortSignal)=>new Promise((_resolve,reject)=>{
    signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});
  }));
  const first=loadDemoCatalog();
  expect(loadDemoCatalog()).toBe(first);
  const assertion=expect(first).rejects.toThrow('unavailable');
  await vi.advanceTimersByTimeAsync(25_200);
  await assertion;
  expect(fetcher).toHaveBeenCalledTimes(3);
  fetcher.mockResolvedValue(Response.json(publishedDemo));
  await expect(loadDemoCatalog()).resolves.toEqual(publishedDemo);
});
