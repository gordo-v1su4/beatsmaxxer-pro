import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VideoPool, waitForPresentedVideoFrame } from '$lib/media/VideoPool';
import type { TimelineFrame } from '$lib/transport';

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
  playbackRate = 1;
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
  removeAttribute(_name: string) {}
  load() {}
  remove() {}

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
  test('a controlled replacement refreshes its moving target before publication',async()=>{
    const pool=new VideoPool(),previous=new ArmableVideo(10),video=new ArmableVideo(10);
    (pool as unknown as {videos:Map<string,unknown>}).videos.set('top-1',previous);
    const frame={playing:true,positionSeconds:5,playbackRate:1,generation:1,contextTimeSeconds:5} as TimelineFrame;
    pool.syncControlledModule('top-1',3,.5,frame);pool.tick(frame);
    vi.spyOn(pool as unknown as {loadVideo:()=>Promise<HTMLVideoElement>},'loadVideo').mockResolvedValue(video as unknown as HTMLVideoElement);
    const candidate=await pool.prepare('top-1','blob:slow-ramp');
    const pending=pool.prewarmCandidate(candidate);
    const later={...frame,positionSeconds:6,contextTimeSeconds:6};
    pool.syncControlledModule('top-1',4,1.75,later);pool.tick(later);
    await flushArmPresentation(video);await flushArmPresentation(video);await pending;
    expect(video.currentTime).toBe(4);expect(video.playbackRate).toBe(1.75);
    expect(pool.get('top-1')).toBe(previous);
  });
  test('a slow incoming decoder catches up before it replaces the visible source',async()=>{
    const pool=new VideoPool(),video=new ArmableVideo(10);
    vi.spyOn(pool as unknown as {loadVideo:()=>Promise<HTMLVideoElement>},'loadVideo').mockResolvedValue(video as unknown as HTMLVideoElement);
    const frame={playing:true,positionSeconds:5,playbackRate:1,generation:1,contextTimeSeconds:5} as TimelineFrame;
    pool.markFreeRun('top-5');pool.tick(frame);
    const candidate=await pool.prepare('top-5','blob:slow-replacement');
    const pending=pool.prewarmCandidate(candidate);
    pool.tick({...frame,positionSeconds:6,contextTimeSeconds:6});
    await flushArmPresentation(video);
    await flushArmPresentation(video);await pending;
    expect(video.currentTime).toBe(6);
    expect(pool.get('top-5')).toBeUndefined();
  });
  test('a replacement joins the running transport before replacing the visible source', async () => {
    const pool = new VideoPool(), video = new ArmableVideo(10);
    vi.spyOn(pool as unknown as {loadVideo: () => Promise<HTMLVideoElement>}, 'loadVideo')
      .mockResolvedValue(video as unknown as HTMLVideoElement);
    pool.tick({playing:true,positionSeconds:5,playbackRate:1,generation:1,contextTimeSeconds:5} as TimelineFrame);
    const candidate = await pool.prepare('top-5', 'blob:replacement');
    const pending = pool.prewarmCandidate(candidate);
    await flushArmPresentation(video); await pending;
    expect(video.currentTime).toBe(5);
    expect(video.paused).toBe(false);
  });

  test('a replacement for a controlled effect joins its mapped time and rate', async () => {
    const pool = new VideoPool(), previous = new ArmableVideo(10), video = new ArmableVideo(10);
    (pool as unknown as {videos:Map<string,unknown>}).videos.set('bottom-5', previous);
    const frame = {playing:true,positionSeconds:5,playbackRate:1,generation:1,contextTimeSeconds:5} as TimelineFrame;
    pool.syncControlledModule('bottom-5', 7, .5, frame);
    pool.tick(frame);
    vi.spyOn(pool as unknown as {loadVideo: () => Promise<HTMLVideoElement>}, 'loadVideo')
      .mockResolvedValue(video as unknown as HTMLVideoElement);
    const candidate = await pool.prepare('bottom-5', 'blob:controlled');
    const pending = pool.prewarmCandidate(candidate);
    await flushArmPresentation(video); await pending;
    expect(video.currentTime).toBe(7);
    expect(video.playbackRate).toBe(.5);
    expect(video.paused).toBe(false);
  });

  test('committing a live-warmed replacement does not immediately seek it again', async () => {
    const pool = new VideoPool(), video = new ArmableVideo(10);
    vi.spyOn(pool as unknown as {loadVideo: () => Promise<HTMLVideoElement>}, 'loadVideo')
      .mockResolvedValue(video as unknown as HTMLVideoElement);
    const frame = {playing:true,positionSeconds:5,playbackRate:1,generation:1,contextTimeSeconds:5} as TimelineFrame;
    pool.markFreeRun('top-5'); pool.tick(frame);
    const candidate = await pool.prepare('top-5', 'blob:replacement');
    const pending = pool.prewarmCandidate(candidate);
    await flushArmPresentation(video); await pending;
    const later = {...frame, positionSeconds:5.2,contextTimeSeconds:5.2};
    pool.tick(later); await pool.commitCandidate(candidate).previousReleased; pool.tick(later);
    expect(video.currentTime).toBe(5);
    expect(video.paused).toBe(false);
  });

  test('incoming sampler projection survives its expected source-remap generation', async () => {
    const pool = new VideoPool(), previous = new ArmableVideo(10), video = new ArmableVideo(16);
    (pool as unknown as {videos:Map<string,unknown>}).videos.set('top-3', previous);
    const frame = {playing:true,positionSeconds:5,playbackRate:1,generation:1,contextTimeSeconds:5} as TimelineFrame;
    pool.syncControlledModule('top-3', 7, 1, frame, 4); pool.tick(frame);
    pool.setCandidateClockResolver(()=>({seconds:2,rate:1,controlGeneration:0}));
    vi.spyOn(pool as unknown as {loadVideo: () => Promise<HTMLVideoElement>}, 'loadVideo')
      .mockResolvedValue(video as unknown as HTMLVideoElement);
    const candidate = await pool.prepare('top-3','blob:new-sampler');
    const pending = pool.prewarmCandidate(candidate);
    await flushArmPresentation(video); await pending;
    await pool.commitCandidate(candidate).previousReleased;
    pool.syncControlledModule('top-3',2.1,1,{...frame,contextTimeSeconds:5.1},0);
    expect(video.currentTime).toBe(2);
    expect(video.paused).toBe(false);
  });

  test('PGM prewarm does not park a playing rack video at zero', async () => {
    const pool = new VideoPool();
    const video = new ArmableVideo(10, 4);
    video.readyState = HAVE_CURRENT_DATA;
    video.videoWidth = 1920;
    await video.play();
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('top-5', video);
    const pause = vi.spyOn(video, 'pause');
    const pending = pool.prewarm('top-5');
    await flushArmPresentation(video);
    await pending;
    expect(pause).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(4);
    expect(video.paused).toBe(false);
  });

  test('a pending PGM prewarm cannot pause playback that starts during decode', async () => {
    const pool = new VideoPool();
    const video = new ArmableVideo(10, 4);
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('bottom-5', video);
    const pending = pool.prewarm('bottom-5');
    await video.play();
    await flushArmPresentation(video);
    await pending;
    expect(video.paused).toBe(false);
    expect(video.currentTime).toBe(4);
  });

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

  test('prewarm waits for decode without moving a committed source', async () => {
    const pool = new VideoPool();
    const video = new ArmableVideo(8, 4);
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('slot-c', video);

    const prewarmPromise = pool.prewarm('slot-c');
    await flushArmPresentation(video);
    await prewarmPromise;

    expect(video.currentTime).toBe(4);
    expect(video.paused).toBe(true);
  });
});
