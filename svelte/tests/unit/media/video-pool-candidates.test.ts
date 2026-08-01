import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VIDEO_LOAD_TIMEOUT_MS, VideoPool } from '$lib/media/VideoPool';

class FakeVideo {
  src = '';
  muted = false;
  playsInline = false;
  loop = false;
  preload = '';
  crossOrigin = '';
  style = { cssText: '' };
  readyState = 4;
  videoWidth = 1920;
  duration = 10;
  currentTime = 0;
  playbackRate = 1;
  paused = true;
  seeking = false;
  removed = 0;
  private listeners = new Map<string, Set<() => void>>();

  constructor(private readonly autoEvent: 'loadeddata' | 'error' | null = 'loadeddata') {}

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  load() {
    if (this.autoEvent && this.src) queueMicrotask(() => this.emit(this.autoEvent!));
  }

  async play() {
    this.paused = false;
  }

  pause() {
    this.paused = true;
  }

  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }

  remove() {
    this.removed += 1;
  }
}

describe('VideoPool candidate transactions', () => {
  let videos: FakeVideo[];

  beforeEach(() => {
    videos = [];
    vi.stubGlobal('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 });
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        const video = new FakeVideo();
        videos.push(video);
        return video;
      }),
      body: { appendChild: vi.fn() }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('keeps active media authoritative until candidate commit', async () => {
    const pool = new VideoPool();
    const first = await pool.prepare('fx', 'blob:first');
    await pool.prewarmCandidate(first);
    pool.commitCandidate(first);

    const second = await pool.prepare('fx', 'blob:second');
    await pool.prewarmCandidate(second);
    expect(pool.get('fx')).toBe(first.video);

    const commit = pool.commitCandidate(second);
    expect(pool.get('fx')).toBe(second.video);
    await commit.previousReleased;
    expect((first.video as unknown as FakeVideo).removed).toBe(1);
  });

  test('invalidates pending preparation on detach and destroys its late element', async () => {
    const pendingVideo = new FakeVideo(null);
    vi.mocked(document.createElement).mockReturnValueOnce(
      pendingVideo as unknown as HTMLVideoElement
    );
    const pool = new VideoPool();
    const pending = pool.prepare('fx', 'blob:late');

    await pool.detach('fx');
    pendingVideo.emit('loadeddata');

    await expect(pending).rejects.toThrow('video-candidate-invalidated');
    expect(pendingVideo.removed).toBe(1);
  });

  test('dispose actively settles a hanging preparation and destroys its element', async () => {
    const pendingVideo = new FakeVideo(null);
    vi.mocked(document.createElement).mockReturnValueOnce(
      pendingVideo as unknown as HTMLVideoElement
    );
    const pool = new VideoPool();
    const pending = pool.prepare('fx', 'blob:hanging');
    const rejected = expect(pending).rejects.toThrow('video-candidate-invalidated');

    await pool.dispose();

    await rejected;
    expect(pendingVideo.removed).toBe(1);
  });

  test('bounds a load that never emits readiness or failure', async () => {
    vi.useFakeTimers();
    const pendingVideo = new FakeVideo(null);
    vi.mocked(document.createElement).mockReturnValueOnce(
      pendingVideo as unknown as HTMLVideoElement
    );
    const pool = new VideoPool();
    const rejected = expect(pool.prepare('fx', 'blob:timeout')).rejects.toThrow(
      'video-wait-timeout'
    );

    await vi.advanceTimersByTimeAsync(VIDEO_LOAD_TIMEOUT_MS);

    await rejected;
    expect(pendingVideo.removed).toBe(1);
    vi.useRealTimers();
  });

  test('destroys a failed temporary element and never installs it', async () => {
    const failedVideo = new FakeVideo('error');
    vi.mocked(document.createElement).mockReturnValueOnce(
      failedVideo as unknown as HTMLVideoElement
    );
    const pool = new VideoPool();

    await expect(pool.prepare('fx', 'blob:bad')).rejects.toThrow('Video load failed');
    expect(pool.get('fx')).toBeUndefined();
    expect(failedVideo.removed).toBe(1);
  });

  test('tracks same-module candidates independently by token', async () => {
    const pool = new VideoPool();
    const [first, second] = await Promise.all([
      pool.prepare('fx', 'blob:one'),
      pool.prepare('fx', 'blob:two')
    ]);

    expect(first.token).not.toBe(second.token);
    await pool.discardCandidate(first);
    pool.commitCandidate(second);
    expect(pool.get('fx')).toBe(second.video);
    expect((first.video as unknown as FakeVideo).removed).toBe(1);
  });

  test('detach aborts candidate prewarm instead of leaving lifecycle completion pending', async () => {
    const pool = new VideoPool();
    const candidate = await pool.prepare('fx', 'blob:warming');
    const video = candidate.video as unknown as FakeVideo;
    video.readyState = 0;
    video.videoWidth = 0;
    const warming = pool.prewarmCandidate(candidate);

    await pool.detach('fx');

    await expect(warming).rejects.toThrow('video-candidate-invalidated');
    expect(video.removed).toBe(1);
  });

  test('detach promptly pauses and releases an active decoded element', async () => {
    const pool = new VideoPool();
    const candidate = await pool.prepare('fx', 'blob:active');
    pool.commitCandidate(candidate);
    const video = candidate.video as unknown as FakeVideo;
    video.paused = false;

    await pool.detach('fx');

    expect(video.paused).toBe(true);
    expect(video.removed).toBe(1);
    expect(pool.get('fx')).toBeUndefined();
  });

  test('does not restart an already decoded active element when repeatedly prewarmed', async () => {
    const pool = new VideoPool();
    const candidate = await pool.prepare('fx', 'blob:ready');
    pool.commitCandidate(candidate);
    const video = candidate.video as unknown as FakeVideo;

    await pool.prewarm('fx');
    await pool.prewarm('fx');

    expect(video.paused).toBe(true);
  });
});
