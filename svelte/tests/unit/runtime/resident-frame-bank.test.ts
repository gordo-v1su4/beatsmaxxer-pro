import { beforeEach, describe, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => ({
  dispose: vi.fn(), close: vi.fn(), frameClose: vi.fn(),
  count: 3, width: 16, height: 9, failAfter: -1, onSample: null as null | (() => void)
}));
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [], BlobSource: class { constructor(public data: Blob) {} },
  UrlSource: class { constructor(public url: string) {} },
  Input: class {
    dispose = media.dispose;
    async getPrimaryVideoTrack() {
      return { getDisplayWidth: async () => media.width, getDisplayHeight: async () => media.height,
        computeDuration: async () => media.count / 96,
        computePacketStats: async () => ({ packetCount: media.count, averagePacketRate: 96 }) };
    }
  },
  VideoSampleSink: class {
    async *samples() {
      for (let i = 0; i < media.count; i++) {
        if (i === media.failAfter) throw new Error('decoder failed');
        media.onSample?.();
        yield { timestamp: i / 96, duration: 1 / 96, close: media.close,
          toVideoFrame: () => ({ displayWidth: media.width, displayHeight: media.height, close: media.frameClose }) };
      }
    }
  }
}));

import { ResidentFrameBank, ResidentMemoryBudget, residentFrameIndex } from '$lib/runtime/timing/ResidentFrameBank';
import { RACK_SLOT_IDS } from '$lib/modules/rackSlots';

function device() {
  const copy=vi.fn((_source:unknown,_destination:unknown,_size:unknown)=>{});
  const textures: { destroy: ReturnType<typeof vi.fn>; createView: ReturnType<typeof vi.fn> }[] = [];
  const gpu = {
    limits: { maxTextureDimension2D: 4096 }, pushErrorScope: vi.fn(), popErrorScope: vi.fn(async () => null),
    queue: { onSubmittedWorkDone: vi.fn(async () => {}), submit:vi.fn(),copyExternalImageToTexture: vi.fn((_source:unknown,_destination:unknown,_size:unknown) => {}) },
    createCommandEncoder:vi.fn(()=>({copyTextureToTexture:copy,finish:vi.fn(()=>({}))})),
    createTexture: vi.fn((_descriptor:GPUTextureDescriptor) => {
      const texture = { destroy: vi.fn(), createView: vi.fn((_descriptor?:GPUTextureViewDescriptor) => ({})) }; textures.push(texture); return texture;
    })
  };
  return { gpu: gpu as unknown as GPUDevice, textures, raw: gpu,copy };
}

beforeEach(() => {
  vi.clearAllMocks(); media.count = 3; media.failAfter = -1; media.onSample = null;
  vi.stubGlobal('GPUTextureUsage', { COPY_SRC:1,TEXTURE_BINDING: 4, COPY_DST: 2, RENDER_ATTACHMENT: 16 });
});

describe('resident production bank', () => {
  it('serializes upload error scopes across independent banks on the same GPU device', async () => {
    const d = device(), budget = new ResidentMemoryBudget(100000);
    let finish!:()=>void, depth=0, peak=0;
    const blocked = new Promise<void>(resolve=>{finish=resolve;});
    d.raw.pushErrorScope.mockImplementation(()=>{depth++;peak=Math.max(peak,depth);});
    d.raw.popErrorScope.mockImplementation(async()=>{depth--;return null;});
    d.raw.queue.onSubmittedWorkDone.mockImplementationOnce(()=>blocked);
    const first=new ResidentFrameBank(d.gpu,budget), second=new ResidentFrameBank(d.gpu,budget);
    const one=first.load('https://example.test/one.mp4');
    await vi.waitFor(()=>expect(d.raw.queue.onSubmittedWorkDone).toHaveBeenCalledOnce());
    const two=second.load('https://example.test/two.mp4');
    try {
      await new Promise(resolve=>setTimeout(resolve,0));
      expect(peak).toBe(1);
    } finally {finish();await Promise.all([one,two]);first.dispose();second.dispose();}
    expect(depth).toBe(0);
  });
  it('serves twelve independent slot times from one shared bank', async () => {
    const d = device(), bank = new ResidentFrameBank(d.gpu,new ResidentMemoryBudget(100000));
    await bank.load('https://example.test/shared.mp4');
    try {
      const views = RACK_SLOT_IDS.map((slot,i)=>bank.frameAt((i%3)/96,slot)?.view);
      expect(views).toHaveLength(12);
      expect(new Set(views).size).toBe(12);
      expect(views.every(Boolean)).toBe(true);
    } finally { bank.dispose(); }
  });
  it('packs frames into atlases and selects separate regions for shared clip consumers', async () => {
    media.count = 130;
    const d = device(), budget = new ResidentMemoryBudget(100000), bank = new ResidentFrameBank(d.gpu, budget);
    await bank.load('https://example.test/long.mp4');
    expect(d.raw.createTexture.mock.calls.map(call => (call[0] as GPUTextureDescriptor).size).slice(-3)).toEqual([[128,72],[128,72],[32,9]]);
    expect(bank.stats.frames).toBe(130);
    const left=bank.frameAt(129 / 96,'top-0'),right=bank.frameAt(0,'bottom-0');
    expect(left?.pts).toBe(129 / 96);expect(right?.pts).toBe(0);
    expect(left?.view).not.toBe(right?.view);
    expect(d.raw.queue.copyExternalImageToTexture.mock.calls[129][1]).toMatchObject({origin:[16,0,0]});
    expect(d.copy.mock.calls[0][0]).toMatchObject({origin:[16,0,0]});
    expect(d.copy.mock.calls[1][0]).toMatchObject({origin:[0,0,0]});
    expect(d.copy.mock.calls[0][1]).not.toEqual(d.copy.mock.calls[1][1]);
    bank.frameAt(129 / 96,'top-0');expect(d.copy).toHaveBeenCalledTimes(2);
    bank.dispose();
    expect(d.textures.every(texture => texture.destroy.mock.calls.length === 1)).toBe(true);
    expect(budget.used).toBe(0);
  });
  it('retains 96fps samples, disposes the decoder before use and selects without uploads', async () => {
    const d = device(), budget = new ResidentMemoryBudget(10000), bank = new ResidentFrameBank(d.gpu, budget);
    expect(bank.frameAt(0)).toBeNull();
    await bank.load(new Blob(['video']));
    expect(bank.stats).toMatchObject({ ready: true, frames: 3, fps: 96, decoderDisposed: true });
    expect(media.dispose).toHaveBeenCalledOnce();
    expect(media.close).toHaveBeenCalledTimes(3);
    expect(media.frameClose).toHaveBeenCalledTimes(3);
    expect(bank.frameAt(1 / 96)?.pts).toBe(1 / 96);
    expect(bank.frameAt(bank.duration)?.pts).toBe(0);
    expect(bank.frameAt(-1 / 192)?.pts).toBe(2 / 96);
    expect(d.raw.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(3);
    bank.dispose(); bank.dispose();
    expect(budget.used).toBe(0);
    expect(d.textures.every(t => t.destroy.mock.calls.length === 1)).toBe(true);
    expect(bank.frameAt(0)).toBeNull();
  });

  it('preflights aggregate budget before creating any textures for an additional clip', async () => {
    const d = device(), budget = new ResidentMemoryBudget(10000);
    const first = new ResidentFrameBank(d.gpu, budget), second = new ResidentFrameBank(d.gpu, budget);
    await first.load('https://example.test/one.mp4');
    const used = budget.used;
    await expect(second.load('https://example.test/two.mp4')).rejects.toThrow('available');
    expect(d.textures).toHaveLength(RACK_SLOT_IDS.length + 1);
    expect(budget.used).toBe(used);
    first.dispose(); expect(budget.used).toBe(0);
  });

  it('releases partial allocations when decoding fails', async () => {
    const d = device(), budget = new ResidentMemoryBudget(10000), bank = new ResidentFrameBank(d.gpu, budget);
    media.failAfter = 1;
    await expect(bank.load('https://example.test/broken.mp4')).rejects.toThrow('decoder failed');
    expect(d.textures[0].destroy).toHaveBeenCalledOnce();
    expect(budget.used).toBe(0);
    expect(bank.stats.ready).toBe(false);
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('cancels in-flight decode and never publishes partial frames', async () => {
    const d = device(), budget = new ResidentMemoryBudget(10000), bank = new ResidentFrameBank(d.gpu, budget);
    media.onSample = () => { if (d.raw.queue.copyExternalImageToTexture.mock.calls.length === 1) bank.dispose(); };
    await expect(bank.load('https://example.test/clip.mp4')).rejects.toThrow('cancelled');
    expect(budget.used).toBe(0); expect(bank.frameAt(0)).toBeNull();
    expect(d.textures[0].destroy).toHaveBeenCalledOnce();
  });

  it('uses source timestamps for variable frame spacing', () => {
    const frames = [{ pts: 0 }, { pts: 0.01 }, { pts: 0.06 }];
    expect(residentFrameIndex(frames, 0.05)).toBe(1);
    expect(residentFrameIndex(frames, 0.06)).toBe(2);
    expect(residentFrameIndex(frames, NaN)).toBe(-1);
    expect(residentFrameIndex([], 0)).toBe(-1);
  });
});
