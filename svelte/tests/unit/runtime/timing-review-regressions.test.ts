import { afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { identifyInterpolation } from '$lib/runtime/timing/interpolation';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';
import { allowTimingClip, clipTiming, parseTimingSettings, timingSettings, timingStatus, toggleTimingBypass } from '$lib/stores/timing';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); timingStatus.set({}); timingSettings.set(parseTimingSettings(null)); });

it('always permits bypass of an incompatible restored RIFE Stutter setting', () => {
  const config = {...defaultClipTiming('top-1'),effect:'stutter' as const,lastEffect:'stutter' as const};
  timingSettings.update(s=>({...s,clips:{'top-1':config}}));
  timingStatus.set({'top-1':{state:'ready',frames:1,total:1,bytes:1,interpolationFactor:4}});
  expect(allowTimingClip('top-1',4,config)).toBe(false);
  toggleTimingBypass('top-1');
  expect(clipTiming('top-1').effect).toBe('off');
  toggleTimingBypass('top-1');
  expect(clipTiming('top-1').effect).toBe('off');
  expect(get(timingStatus)['top-1'].interpolationFactor).toBe(4);
});

it('shares verification work across callers, including concurrent requests', async () => {
  const source = new Blob(['unknown media']);
  const read = vi.spyOn(source,'arrayBuffer');
  await Promise.all([identifyInterpolation(source,96),identifyInterpolation(source,96)]);
  await identifyInterpolation(source,96);
  expect(read).toHaveBeenCalledTimes(1);
});

it('rejects failed URL verification and retries instead of caching a non-RIFE result', async () => {
  const fetchSource = vi.fn().mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(new Response(new Blob(['media'])));
  vi.stubGlobal('fetch', fetchSource);
  await expect(identifyInterpolation('https://example.test/retry.webm',96)).rejects.toThrow('offline');
  expect(await identifyInterpolation('https://example.test/retry.webm',96)).toBe(1);
  await identifyInterpolation('https://example.test/retry.webm',96);
  expect(fetchSource).toHaveBeenCalledTimes(2);
});

it('retries a Blob after a temporary read failure', async () => {
  const source = new Blob(['media']);
  const read = vi.spyOn(source,'arrayBuffer').mockRejectedValueOnce(new Error('read failed'));
  await expect(identifyInterpolation(source,96)).rejects.toThrow('read failed');
  expect(await identifyInterpolation(source,96)).toBe(1);
  expect(read).toHaveBeenCalledTimes(2);
});
