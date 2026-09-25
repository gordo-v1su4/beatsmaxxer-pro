import { afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { identifyInterpolation } from '$lib/runtime/timing/interpolation';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';
import { allowTimingClip, clipTiming, parseTimingSettings, timingSettings, timingStatus, toggleTimingBypass } from '$lib/stores/timing';

afterEach(() => { vi.restoreAllMocks(); timingStatus.set({}); timingSettings.set(parseTimingSettings(null)); });

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
