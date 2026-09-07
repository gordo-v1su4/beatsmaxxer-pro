import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VideoPool, waitForPresentedVideoFrame } from '$lib/media/VideoPool';

const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;

class ArmableVideo {
  duration = 10;
  muted = true;
  playsInline = true;
  videoWidth = 0;
  readyState = HAVE_METADATA;
  paused = true;
  seeking = false;
  private time = 0;
  private listeners = new Map<string, Set<() => void>>();
  private rvfcQueue: Array<() => void> = [];

  constructor(duration = 10, initialTime = 0) {
    this.duration = duration;
    this.time = initialTime;
  }

  get currentTime() {
    return this.time;
  }

  set currentTime(value: number) {
    this.seeking = true;
    this.time = value;
    queueMicrotask(() => {
      this.seeking = false;
      this.readyState = HAVE_CURRENT_DATA;
      this.videoWidth = 1920;
      this.emit('seeked');
    });
  }

  pause() {
    this.paused = true;
  }

  async play() {
    this.paused = false;
  }

  addEventListener(type: string, listener: () => void) {
    const bucket = this.listeners.get(type) ?? new Set();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  requestVideoFrameCallback(callback: () => void) {
    this.rvfcQueue.push(callback);
    return this.rvfcQueue.length;
  }

  cancelVideoFrameCallback() {}

  emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  flushPresentedFrame(): boolean {
    const callback = this.rvfcQueue.shift();
    if (!callback) return false;
    callback();
    return true;
  }
}

async function flushArmPresentation(video: ArmableVideo) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await Promise.resolve();
    if (video.flushPresentedFrame()) return;
  }
}

beforeEach(() => {
  vi.stubGlobal('HTMLMediaElement', {
    HAVE_METADATA,
    HAVE_CURRENT_DATA
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('waitForPresentedVideoFrame', () => {
  test('resolves after requestVideoFrameCallback fires', async () => {
    const video = new ArmableVideo();
    const promise = waitForPresentedVideoFrame(video as unknown as HTMLVideoElement, 1000);
    video.flushPresentedFrame();
    await expect(promise).resolves.toBeUndefined();
  });
});

describe('VideoPool arm-at-trim', () => {
  test('seeks to trim start, waits for presentation, and parks paused', async () => {
    const pool = new VideoPool();
    const video = new ArmableVideo(10, 5);
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('slot-a', video);

    const armPromise = pool.armAtTrim('slot-a', 0);
    await flushArmPresentation(video);
    await armPromise;

    expect(video.currentTime).toBe(0);
    expect(video.paused).toBe(true);
    expect(pool.isArmedAtTrim('slot-a', 0)).toBe(true);
    expect(pool.hasReadyFrame('slot-a')).toBe(true);
  });

  test('reuses an in-flight arm promise for the same trim point', async () => {
    const pool = new VideoPool();
    const video = new ArmableVideo(10, 5);
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('slot-b', video);

    const first = pool.armAtTrim('slot-b', 0);
    const second = pool.armAtTrim('slot-b', 0);
    await flushArmPresentation(video);
    await Promise.all([first, second]);

    expect(video.requestVideoFrameCallback).toBeDefined();
    expect(pool.isArmedAtTrim('slot-b')).toBe(true);
  });

  test('prewarm delegates to armAtTrim at zero', async () => {
    const pool = new VideoPool();
    const video = new ArmableVideo(8, 4);
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('slot-c', video);

    const prewarmPromise = pool.prewarm('slot-c');
    await flushArmPresentation(video);
    await prewarmPromise;

    expect(video.currentTime).toBe(0);
    expect(pool.isArmedAtTrim('slot-c')).toBe(true);
  });
});
