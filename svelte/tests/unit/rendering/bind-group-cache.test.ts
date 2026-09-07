import { describe, expect, test, vi } from 'vitest';
import { BlitBindGroupCache, IdleBindGroupCache, TextureViewBindGroupCache } from '$lib/rendering/webgpu/BindGroupCache';

describe('IdleBindGroupCache', () => {
  test('isolates bind groups per uniform buffer for the same texture views', () => {
    const cache = new IdleBindGroupCache();
    const uniformA = {} as GPUBuffer;
    const uniformB = {} as GPUBuffer;
    const videoView = {} as GPUTextureView;
    const feedbackView = {} as GPUTextureView;
    const create = vi.fn(
      (() => {
        let count = 0;
        return () => ({ id: `idle-${++count}` }) as GPUBindGroup;
      })(),
    );

    const slotA = cache.get(uniformA, videoView, feedbackView, create);
    const slotB = cache.get(uniformB, videoView, feedbackView, create);

    expect(slotA).not.toBe(slotB);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('TextureViewBindGroupCache', () => {
  test('reuses bind groups for the same view pair', () => {
    const cache = new TextureViewBindGroupCache();
    const videoView = {} as GPUTextureView;
    const feedbackView = {} as GPUTextureView;
    const create = vi.fn(() => ({ id: 'idle' }) as GPUBindGroup);

    const first = cache.get(videoView, feedbackView, create);
    const second = cache.get(videoView, feedbackView, create);

    expect(first).toBe(second);
    expect(create).toHaveBeenCalledOnce();
  });

  test('creates a new bind group when the feedback view changes', () => {
    const cache = new TextureViewBindGroupCache();
    const videoView = {} as GPUTextureView;
    const feedbackA = {} as GPUTextureView;
    const feedbackB = {} as GPUTextureView;
    const create = vi.fn(
      (() => {
        let count = 0;
        return () => ({ id: `idle-${++count}` }) as GPUBindGroup;
      })()
    );

    const first = cache.get(videoView, feedbackA, create);
    const second = cache.get(videoView, feedbackB, create);

    expect(first).not.toBe(second);
    expect(create).toHaveBeenCalledTimes(2);
  });

  test('clear drops cached groups', () => {
    const cache = new TextureViewBindGroupCache();
    const videoView = {} as GPUTextureView;
    const feedbackView = {} as GPUTextureView;
    const create = vi.fn(() => ({ id: 'idle' }) as GPUBindGroup);

    cache.get(videoView, feedbackView, create);
    cache.clear();
    cache.get(videoView, feedbackView, create);

    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('BlitBindGroupCache', () => {
  test('reuses bind groups for the same source view', () => {
    const cache = new BlitBindGroupCache();
    const sourceView = {} as GPUTextureView;
    const create = vi.fn(() => ({ id: 'blit' }) as GPUBindGroup);

    const first = cache.get(sourceView, create);
    const second = cache.get(sourceView, create);

    expect(first).toBe(second);
    expect(create).toHaveBeenCalledOnce();
  });
});
