import { afterEach, expect, test, vi } from 'vitest';
import publishedDemo from '$lib/runtime/publicDemo.json';

const fetcher = vi.hoisted(() => vi.fn());
vi.mock('$lib/platform/hostedApi', () => ({ hostedDemoFetch:fetcher }));
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
  const failure=expect(loadDemoCatalog()).rejects.toThrow('Offline');
  await vi.runAllTimersAsync(); await failure;
  expect(fetcher).toHaveBeenCalledTimes(3);
  fetcher.mockResolvedValue(Response.json(publishedDemo));
  await expect(loadDemoCatalog()).resolves.toEqual(publishedDemo);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

test('an invalid published bundle fails without retrying validation errors', async () => {
  fetcher.mockResolvedValue(Response.json({...publishedDemo,id:'wrong-bundle'}));
  await expect(loadDemoCatalog()).rejects.toThrow('out of date');
  expect(fetcher).toHaveBeenCalledOnce();
});
