import { expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { TimingRuntime } from '$lib/runtime/timing/TimingRuntime';
import { ResidentFrameBank, ResidentMemoryBudget } from '$lib/runtime/timing/ResidentFrameBank';
import * as interpolation from '$lib/runtime/timing/interpolation';
import { arrangement } from '$lib/stores/arrangement';
import { videoLayers } from '$lib/stores/rack';
import { parseTimingSettings, timingSettings, timingStatus, timingCacheCapacity } from '$lib/stores/timing';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';

test('counts cached ramp sections and a shared failed asset once when suggesting capacity', async () => {
  const runtime = new TimingRuntime();
  const allocations = new Map<ResidentFrameBank, number>();
  vi.spyOn(ResidentFrameBank.prototype, 'load').mockImplementation(async function (this:ResidentFrameBank, source) {
    const bytes = source === 'blob:future' ? 50 : 40;
    const budget = (this as unknown as { budget: ResidentMemoryBudget }).budget;
    budget.check(bytes);
    budget.claim(bytes);
    allocations.set(this, bytes);
  });
  vi.spyOn(ResidentFrameBank.prototype, 'stats', 'get').mockImplementation(function (this:ResidentFrameBank) {
    const bytes = allocations.get(this) ?? 0;
    return {ready:bytes>0,frames:bytes?1:0,bytes,width:1,height:1,fps:96,duration:1,
      decoderDisposed:true,decodedFrames:1,uploadedFrames:1,loadMs:0};
  });
  vi.spyOn(ResidentFrameBank.prototype, 'dispose').mockImplementation(function (this:ResidentFrameBank) {
    (this as unknown as {budget:ResidentMemoryBudget}).budget.release(allocations.get(this) ?? 0);
    allocations.delete(this);
  });
  vi.spyOn(interpolation, 'identifyInterpolation').mockResolvedValue(4);
  const settings={...parseTimingSettings(null),budgetGiB:120 / 2**30};
  // Capacity applies to resident ramps; original streaming clips allocate no bank.
  settings.clips['top-1']={...defaultClipTiming('top-1'),effect:'ramp'};
  timingSettings.set(settings);
  arrangement.set([{id:'cache',name:'Cache',bars:1,scene:{slots:{
    'top-0':{url:'blob:old',name:'old'},'top-1':{url:'blob:future',name:'future'},
  }}}] as never);
  videoLayers.set({'top-0':{url:'blob:old',name:'old'}} as never);
  try {
    runtime.setActive(true, {} as GPUDevice);
    await vi.waitFor(() => expect(get(timingCacheCapacity)).toEqual({usedBytes:90,requiredBytes:90,pending:0}));
    videoLayers.set({
      'top-0':{url:'blob:new',name:'new'},'top-1':{url:'blob:new',name:'new'},
    } as never);
    await vi.waitFor(() => expect(get(timingStatus)['top-1']?.state).toBe('error'));
    expect(get(timingCacheCapacity)).toEqual({usedBytes:90,requiredBytes:130,pending:0});
    arrangement.set([]);
    expect(get(timingCacheCapacity)).toEqual({usedBytes:0,requiredBytes:40,pending:0});
  } finally {
    runtime.dispose();
    videoLayers.set({});
    arrangement.set([]);
    vi.restoreAllMocks();
  }
});
