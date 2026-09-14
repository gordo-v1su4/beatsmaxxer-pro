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

function device() {
  const textures: { destroy: ReturnType<typeof vi.fn>; createView: ReturnType<typeof vi.fn> }[] = [];
  const gpu = {
    limits: { maxTextureDimension2D: 4096 }, pushErrorScope: vi.fn(), popErrorScope: vi.fn(async () => null),
    queue: { onSubmittedWorkDone: vi.fn(async () => {}), copyExternalImageToTexture: vi.fn() },
    createTexture: vi.fn(() => {
      const texture = { destroy: vi.fn(), createView: vi.fn(() => ({})) }; textures.push(texture); return texture;
    })
  };
  return { gpu: gpu as unknown as GPUDevice, textures, raw: gpu };
}

beforeEach(() => {
  vi.clearAllMocks(); media.count = 3; media.failAfter = -1; media.onSample = null;
  vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 4, COPY_DST: 2, RENDER_ATTACHMENT: 16 });
});

describe('resident production bank', () => {
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
    const d = device(), budget = new ResidentMemoryBudget(2000);
    const first = new ResidentFrameBank(d.gpu, budget), second = new ResidentFrameBank(d.gpu, budget);
    await first.load('https://example.test/one.mp4');
    const used = budget.used;
    await expect(second.load('https://example.test/two.mp4')).rejects.toThrow('available');
    expect(d.textures).toHaveLength(3);
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
    media.onSample = () => { if (d.textures.length === 1) bank.dispose(); };
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
