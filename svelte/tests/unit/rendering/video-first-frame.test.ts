import { afterEach, expect, test, vi } from 'vitest';
import { WebGpuEngine } from '$lib/rendering/webgpu/WebGpuEngine';
import { videoPool } from '$lib/media/VideoPool';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('retains each replacement decoded frame across its first transport seek', () => {
  vi.stubGlobal('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 });
  vi.stubGlobal('GPUTextureUsage', { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 });
  const copy = vi.fn(), views: GPUTextureView[] = [];
  const engine = new WebGpuEngine();
  Object.assign(engine, { device: {
    createTexture: () => {
      const view = {} as GPUTextureView; views.push(view);
      return { createView: () => view, destroy: vi.fn() };
    }, queue: { copyExternalImageToTexture: copy },
  } });
  let video = Object.assign(new EventTarget(), { readyState: 4, videoWidth: 1280, videoHeight: 720, seeking: false });
  vi.spyOn(videoPool, 'get').mockImplementation(() => video as HTMLVideoElement);
  vi.spyOn(videoPool, 'hasReadyFrame').mockImplementation(() => video.readyState >= 2);

  engine.primeVideoFrames(['top-0']);
  expect(copy).toHaveBeenCalledTimes(1);
  video.seeking = true; video.readyState = 1;
  expect(engine.timingVideoFrame('top-0')).toBe(views[0]);

  video = Object.assign(new EventTarget(), { readyState: 4, videoWidth: 1280, videoHeight: 720, seeking: false });
  engine.primeVideoFrames(['top-0']);
  expect(copy).toHaveBeenCalledTimes(2);
  video.seeking = true; video.readyState = 1;
  expect(engine.timingVideoFrame('top-0')).toBe(views[1]);
  engine.primeVideoFrames(['top-0']);
  expect(copy).toHaveBeenCalledTimes(2);
});
