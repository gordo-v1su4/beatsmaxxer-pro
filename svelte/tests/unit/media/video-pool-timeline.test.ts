import { describe, expect, test, vi } from 'vitest';
import {
  VIDEO_DRIFT_CHECK_INTERVAL_SECONDS,
  timelineMediaDrift,
  timelineMediaTarget,
  VideoPool
} from '$lib/media/VideoPool';
import type { TimelineFrame } from '$lib/transport';

function frame(overrides: Partial<TimelineFrame> = {}): TimelineFrame {
  return {
    frameId: 1,
    audioFrameId: 1,
    contextTimeSeconds: 0,
    positionSeconds: 0,
    transportSeconds: 0,
    playbackRate: 1,
    playing: true,
    generation: 1,
    reason: 'play',
    bpm: 120,
    beatPosition: 0,
    beatPhase: 0,
    beatIntervalSeconds: 0.5,
    beatIndex: 0,
    source: 'bpm-fallback',
    fallbackReason: 'missing',
    fixedStepSeconds: 1 / 60,
    fixedStepIndex: 0,
    fixedStepPhase: 0,
    deterministicSeed: 1,
    events: [],
    ...overrides
  };
}

function actuatorVideo(duration = 10) {
  let time = 0;
  let seeks = 0;
  const video = {
    duration,
    playbackRate: 1,
    paused: true,
    seeking: false,
    get currentTime() { return time; },
    set currentTime(value: number) { time = value; seeks += 1; },
    advance(value: number) { time = value; },
    seekCount: () => seeks,
    play: vi.fn(async function (this: { paused: boolean }) { this.paused = false; }),
    pause: vi.fn(function (this: { paused: boolean }) { this.paused = true; })
  };
  return video;
}

describe('VideoPool timeline mapping', () => {
  test('maps the already rate-adjusted timeline position without applying tempo again', () => {
    const timelinePosition = 6;
    expect(timelineMediaTarget(timelinePosition, 5)).toBe(1);
    expect(timelineMediaTarget(timelinePosition * 2, 5)).toBe(2);
  });

  test('rejects unavailable media duration', () => {
    expect(timelineMediaTarget(1, 0)).toBeNull();
    expect(timelineMediaTarget(1, Number.NaN)).toBeNull();
  });

  test('computes the shortest drift across a clip loop boundary', () => {
    expect(timelineMediaDrift(9.9, 0.1, 10)).toBeCloseTo(0.2);
    expect(timelineMediaDrift(0.1, 9.9, 10)).toBeCloseTo(-0.2);
  });

  test('starts free-run playback when tick receives boolean true', () => {
    const pool = new VideoPool();
    const video = actuatorVideo();
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('grain', video);
    pool.markFreeRun('grain');

    pool.tick(true);

    expect(video.play).toHaveBeenCalledOnce();
    expect(video.paused).toBe(false);
  });

  test('does not seek on every animation frame during natural playback', () => {
    const pool = new VideoPool();
    const video = actuatorVideo();
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('grain', video);
    pool.markFreeRun('grain');

    for (let index = 0; index < 120; index += 1) {
      const position = index / 60;
      video.advance(position);
      pool.tick(frame({
        frameId: index + 1,
        contextTimeSeconds: position,
        positionSeconds: position,
        transportSeconds: position,
        reason: index === 0 ? 'play' : 'initial'
      }));
    }

    expect(video.seekCount()).toBe(0);
    expect(video.play).toHaveBeenCalledOnce();
  });

  test('bounds long-GOP drift correction cadence to at most two checks per second', () => {
    const pool = new VideoPool();
    const video = actuatorVideo();
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('grain', video);
    pool.markFreeRun('grain');

    for (let index = 0; index <= 120; index += 1) {
      const position = index / 60;
      pool.tick(frame({
        frameId: index + 1,
        contextTimeSeconds: position,
        positionSeconds: position,
        transportSeconds: position
      }));
    }

    expect(VIDEO_DRIFT_CHECK_INTERVAL_SECONDS).toBeGreaterThanOrEqual(0.5);
    expect(video.seekCount()).toBeLessThanOrEqual(4);
  });

  test('resynchronizes centrally on rate, seek generation, loop wrap, and pause', () => {
    const pool = new VideoPool();
    const video = actuatorVideo();
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('grain', video);
    pool.markFreeRun('grain');

    pool.tick(frame({ positionSeconds: 2, transportSeconds: 2 }));
    expect(video.currentTime).toBe(2);
    expect(video.paused).toBe(false);

    video.advance(2.1);
    pool.tick(frame({
      frameId: 2,
      contextTimeSeconds: 0.1,
      positionSeconds: 2.2,
      transportSeconds: 2.2,
      playbackRate: 2,
      reason: 'rate-change'
    }));
    expect(video.playbackRate).toBe(2);

    pool.tick(frame({
      frameId: 3,
      contextTimeSeconds: 0.2,
      positionSeconds: 7,
      transportSeconds: 7,
      generation: 2,
      playbackRate: 2,
      reason: 'seek'
    }));
    expect(video.currentTime).toBe(7);

    video.advance(9.8);
    pool.tick(frame({
      frameId: 4,
      contextTimeSeconds: 0.3,
      positionSeconds: 0.25,
      transportSeconds: 0.25,
      generation: 3,
      playbackRate: 2,
      reason: 'loop-wrap'
    }));
    expect(video.currentTime).toBe(0.25);

    pool.tick(frame({
      frameId: 5,
      contextTimeSeconds: 0.4,
      positionSeconds: 0.5,
      transportSeconds: 0.5,
      generation: 4,
      playbackRate: 2,
      playing: false,
      reason: 'pause'
    }));
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(0.5);
  });

  test('keeps controlled media paused and actuates timeline-derived time directly', () => {
    const pool = new VideoPool();
    const video = {
      duration: 10,
      currentTime: 0,
      playbackRate: 2,
      paused: false,
      seeking: false,
      pause: vi.fn(function (this: { paused: boolean }) { this.paused = true; })
    };
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('speedramp', video);

    pool.actuateModuleTime('speedramp', 3.25);

    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.paused).toBe(true);
    expect(video.playbackRate).toBe(1);
    expect(video.currentTime).toBe(3.25);
  });

  test('keeps controlled video decoding continuously and bounds timeline corrections', () => {
    const pool = new VideoPool();
    const video = actuatorVideo();
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('speedramp', video);

    for (let index = 0; index < 120; index += 1) {
      const position = index / 60;
      video.advance(position * 1.25);
      pool.syncControlledModule('speedramp', position * 1.25, 1.25, frame({
        frameId: index + 1,
        contextTimeSeconds: position,
        positionSeconds: position,
        transportSeconds: position
      }));
      pool.tick(frame({
        frameId: index + 1,
        contextTimeSeconds: position,
        positionSeconds: position,
        transportSeconds: position
      }));
    }

    expect(video.play).toHaveBeenCalledOnce();
    expect(video.paused).toBe(false);
    expect(video.playbackRate).toBe(1.25);
    expect(video.seekCount()).toBeLessThanOrEqual(1);
    expect(pool.getTimelineTarget('speedramp')).toBeCloseTo((119 / 60) * 1.25);
  });

  test('seeks timesampler only when its jump generation changes', () => {
    const pool = new VideoPool();
    const video = actuatorVideo();
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('timesampler', video);

    pool.syncControlledModule('timesampler', 2, 1, frame(), 0);
    video.advance(2.1);
    pool.syncControlledModule('timesampler', 2.1, 1, frame({ frameId: 2, contextTimeSeconds: 0.1 }), 0);
    expect(video.seekCount()).toBe(1);

    pool.syncControlledModule('timesampler', 7, 1, frame({ frameId: 3, contextTimeSeconds: 0.2 }), 1);
    expect(video.currentTime).toBe(7);
    expect(video.seekCount()).toBe(2);
    expect(video.paused).toBe(false);
    expect(pool.getTimelineTarget('timesampler')).toBe(7);
  });

  test('retries a timesampler jump that arrived during an in-flight seek', () => {
    const pool = new VideoPool();
    const video = actuatorVideo();
    video.seeking = true;
    (pool as unknown as { videos: Map<string, unknown> }).videos.set('timesampler', video);

    pool.syncControlledModule('timesampler', 7, 1, frame(), 1);
    expect(video.seekCount()).toBe(0);

    video.seeking = false;
    pool.syncControlledModule('timesampler', 7, 1, frame({ frameId: 2, contextTimeSeconds: 0.01 }), 1);
    expect(video.currentTime).toBe(7);
    expect(video.seekCount()).toBe(1);
  });
});
