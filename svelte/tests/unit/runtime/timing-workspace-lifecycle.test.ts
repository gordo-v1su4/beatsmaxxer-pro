import { afterEach, expect, test, vi } from 'vitest';
import { TimingRuntime } from '$lib/runtime/timing/TimingRuntime';
import { ResidentFrameBank } from '$lib/runtime/timing/ResidentFrameBank';
import * as interpolation from '$lib/runtime/timing/interpolation';
import { arrangement } from '$lib/stores/arrangement';
import { videoLayers } from '$lib/stores/rack';
import { parseTimingSettings, timingSettings } from '$lib/stores/timing';
import { RACK_SLOT_IDS } from '$lib/modules/rackSlots';
import { defaultClipTiming } from '$lib/runtime/timing/envelope';

afterEach(() => { arrangement.set([]); videoLayers.set({}); vi.restoreAllMocks(); });

function prepareRack(shared = false) {
  const settings = parseTimingSettings(null);
  settings.scope = 'deck';
  for (const slot of RACK_SLOT_IDS) settings.clips[slot] = { ...defaultClipTiming(slot), effect:'ramp' };
  timingSettings.set(settings); arrangement.set([]);
  videoLayers.set(Object.fromEntries(RACK_SLOT_IDS.map((slot, i) => [slot, {
    name: shared ? 'shared' : `clip-${i}`, url: shared ? 'blob:shared' : `blob:clip-${i}`
  }])));
  vi.spyOn(interpolation, 'identifyInterpolation').mockResolvedValue(4);
  vi.spyOn(ResidentFrameBank.prototype, 'stats', 'get').mockReturnValue({
    ready:true, frames:1, bytes:4, width:1, height:1, fps:96, duration:1,
    decoderDisposed:true, decodedFrames:1, uploadedFrames:1, loadMs:0
  });
}

test('leaving Timing cancels its active upload and prevents the other eleven from starting', async () => {
  prepareRack();
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const load = vi.spyOn(ResidentFrameBank.prototype, 'load').mockImplementation(() => gate);
  const dispose = vi.spyOn(ResidentFrameBank.prototype, 'dispose');
  const runtime = new TimingRuntime(), device = {} as GPUDevice;
  try {
    runtime.setActive(true, device);
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    runtime.setActive(false, device);
    expect(dispose).toHaveBeenCalled();
    finish();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledOnce();
    runtime.setActive(true, device);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(13));
  } finally { finish(); runtime.dispose(); }
});

test('twelve slots share one resident load and retain the completed bank across workspace changes', async () => {
  prepareRack(true);
  const load = vi.spyOn(ResidentFrameBank.prototype, 'load').mockResolvedValue();
  const dispose = vi.spyOn(ResidentFrameBank.prototype, 'dispose');
  const runtime = new TimingRuntime(), device = {} as GPUDevice;
  try {
    runtime.setActive(true, device);
    await vi.waitFor(() => expect(runtime.diagnostics.capacity.pending).toBe(0));
    expect(load).toHaveBeenCalledOnce();
    runtime.setActive(false, device);
    expect(dispose).not.toHaveBeenCalled();
    runtime.setActive(true, device);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledOnce();
  } finally { runtime.dispose(); }
});

test('leaving Timing releases sampler-only resident banks instead of duplicating Perform storage', async () => {
  prepareRack(true);
  timingSettings.update(settings => ({ ...settings, clips: Object.fromEntries(
    RACK_SLOT_IDS.map(slot => [slot, { ...settings.clips[slot], effect:'timesampler' as const }])) }));
  const load = vi.spyOn(ResidentFrameBank.prototype, 'load').mockResolvedValue();
  const dispose = vi.spyOn(ResidentFrameBank.prototype, 'dispose');
  const runtime = new TimingRuntime(), device = {} as GPUDevice;
  try {
    runtime.setActive(true, device);
    await vi.waitFor(() => expect(runtime.diagnostics.capacity.pending).toBe(0));
    expect(load).toHaveBeenCalledOnce();
    runtime.setActive(false, device);
    expect(dispose).toHaveBeenCalledOnce();
    runtime.setActive(true, device);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  } finally { runtime.dispose(); }
});

test('a resident source shared by ramp and sampler keeps its expensive ramp cache', async () => {
  prepareRack(true);
  timingSettings.update(settings => ({ ...settings,
    clips: { ...settings.clips, 'top-1': { ...settings.clips['top-1'], effect:'timesampler' } } }));
  const load = vi.spyOn(ResidentFrameBank.prototype, 'load').mockResolvedValue();
  const dispose = vi.spyOn(ResidentFrameBank.prototype, 'dispose');
  const runtime = new TimingRuntime(), device = {} as GPUDevice;
  try {
    runtime.setActive(true, device);
    await vi.waitFor(() => expect(runtime.diagnostics.capacity.pending).toBe(0));
    runtime.setActive(false, device);
    expect(dispose).not.toHaveBeenCalled();
    runtime.setActive(true, device);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledOnce();
  } finally { runtime.dispose(); }
});
