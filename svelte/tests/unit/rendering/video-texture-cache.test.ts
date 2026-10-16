import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { VideoTextureCache } from '$lib/rendering/webgpu/VideoTextureCache';

class Video extends EventTarget {
  readyState = 4; videoWidth = 1280; videoHeight = 720;
  seeking = false; currentTime = 0;
  callbacks = new Map<number, VideoFrameRequestCallback>();
  nextCallback = 0;
  requestVideoFrameCallback(callback: VideoFrameRequestCallback) {
    const id = ++this.nextCallback; this.callbacks.set(id, callback); return id;
  }
  cancelVideoFrameCallback(id: number) { this.callbacks.delete(id); }
  present() {
    const callbacks = [...this.callbacks.values()]; this.callbacks.clear();
    callbacks.forEach(callback => callback(0, {} as VideoFrameCallbackMetadata));
  }
}
beforeEach(() => {
  vi.stubGlobal('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 });
  vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 });
});
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const copy = vi.fn(), destroy = vi.fn();
  const device = { createTexture: () => ({ createView: () => ({}), destroy }), queue: { copyExternalImageToTexture: copy } } as unknown as GPUDevice;
  const cache = new VideoTextureCache();
  const upload = (video: Video) => { cache.beginFrame(); return cache.upload(device, 'top-0', video as unknown as HTMLVideoElement); };
  return { copy, destroy, device, cache, upload };
}
test('copies presented frames, not advancing media clocks, and refreshes completed paused seeks', () => {
  const { cache, copy, upload } = setup(), video = new Video();
  const first = upload(video);
  video.currentTime = .01; expect(upload(video)).toBe(first);
  video.currentTime = .02; upload(video);
  expect(copy).toHaveBeenCalledTimes(1);
  video.present(); upload(video); expect(copy).toHaveBeenCalledTimes(2);
  video.seeking = true; video.readyState = 1;
  expect(upload(video)).toBe(first); expect(copy).toHaveBeenCalledTimes(2);
  video.seeking = false; video.readyState = 4;
  video.dispatchEvent(new Event('seeked')); upload(video);
  expect(copy).toHaveBeenCalledTimes(3);
  cache.dispose(); expect(video.callbacks.size).toBe(0);
});
test('invalidates replacements in the same render task and cancels the old observer', () => {
  const { cache, device, copy } = setup(), first = new Video(), second = new Video();
  const view = cache.upload(device, 'top-0', first as unknown as HTMLVideoElement);
  expect(cache.upload(device, 'top-0', second as unknown as HTMLVideoElement)).not.toBe(view);
  expect(copy).toHaveBeenCalledTimes(2);
  expect(first.callbacks.size).toBe(0);
  cache.dispose(); expect(second.callbacks.size).toBe(0);
});
test('uses media time when frame callbacks are unavailable', () => {
  const { cache, copy, upload } = setup(), video = new Video();
  Object.assign(video, { requestVideoFrameCallback: undefined, cancelVideoFrameCallback: undefined });
  upload(video); upload(video); expect(copy).toHaveBeenCalledTimes(1);
  video.currentTime = 1; upload(video); expect(copy).toHaveBeenCalledTimes(2);
  video.dispatchEvent(new Event('seeked')); upload(video); expect(copy).toHaveBeenCalledTimes(3);
  cache.dispose();
});

test('a failed replacement copy never publishes an uninitialized or destroyed frame', () => {
  const { cache, device, copy } = setup(), first = new Video(), second = new Video();
  const old = cache.upload(device, 'top-0', first as unknown as HTMLVideoElement);
  copy.mockImplementationOnce(() => { throw new Error('decoder changed'); });
  expect(() => cache.upload(device, 'top-0', second as unknown as HTMLVideoElement)).toThrow('decoder changed');
  expect(cache.cachedView('top-0', second as unknown as HTMLVideoElement)).toBeNull();
  const replacement = cache.upload(device, 'top-0', second as unknown as HTMLVideoElement);
  expect(replacement).not.toBe(old);
  expect(copy).toHaveBeenCalledTimes(3);
  cache.dispose();
});
