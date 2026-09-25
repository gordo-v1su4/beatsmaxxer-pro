import { afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { TimingRuntime } from '$lib/runtime/timing/TimingRuntime';
import { ResidentFrameBank } from '$lib/runtime/timing/ResidentFrameBank';
import * as interpolation from '$lib/runtime/timing/interpolation';
import { videoLayers } from '$lib/stores/rack';
import { parseTimingSettings, timingSettings, timingStatus, toggleTimingBypass } from '$lib/stores/timing';
import type { TimelineFrame } from '$lib/transport';

const runtime = new TimingRuntime();
afterEach(() => { runtime.dispose(); videoLayers.set({}); vi.restoreAllMocks(); });

it('blocks a clip whose RIFE identity arrives after loading, and recovers on OFF', async () => {
  timingSettings.set(parseTimingSettings(null));
  vi.spyOn(ResidentFrameBank.prototype,'load').mockResolvedValue();
  vi.spyOn(ResidentFrameBank.prototype,'stats','get').mockReturnValue({ready:true,frames:1,bytes:1,width:10,height:10,fps:96,duration:10,decoderDisposed:true,decodedFrames:1,uploadedFrames:1,loadMs:0});
  const select = vi.spyOn(ResidentFrameBank.prototype,'frameAt').mockReturnValue({view:{} as GPUTextureView,pts:0} as never);
  let resolve!: (factor:number)=>void;
  vi.spyOn(interpolation,'identifyInterpolation').mockImplementation(()=>new Promise<number>(r=>resolve=r));
  videoLayers.set({'top-1':{url:'blob:late-rife',name:'clip'} as never});
  runtime.setActive(true,{} as GPUDevice);
  await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
  const frame={positionSeconds:0,beatPosition:0,beatIntervalSeconds:.5,fixedStepSeconds:1/60,fixedStepIndex:0,fixedStepPhase:0,generation:1,bpm:120,playbackRate:1} as TimelineFrame;
  runtime.tick(frame);
  expect(select).not.toHaveBeenCalled();
  resolve(4);
  await vi.waitFor(()=>expect(get(timingStatus)['top-1']?.interpolationFactor).toBe(4));
  runtime.tick(frame);
  expect(select).not.toHaveBeenCalled();
  expect(get(timingStatus)['top-1'].state).toBe('error');
  toggleTimingBypass('top-1');
  runtime.tick(frame);
  expect(get(timingStatus)['top-1'].state).toBe('ready');
  expect(runtime.textureFor('top-1')?.effect).toBe('off');
});
