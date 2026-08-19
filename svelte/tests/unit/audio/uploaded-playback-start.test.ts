import { afterEach, describe, expect, test, vi } from 'vitest';
import { AudioEngine } from '$lib/audio/AudioEngine';

interface StartInternals {
  ctx: { state: AudioContextState; resume: () => Promise<void> } | null;
  mediaElement: HTMLAudioElement | null;
  _loadedUploadName: string;
  _trackName: string;
  _usingUploadedTrack: boolean;
  ensureContext: () => Promise<void>;
  gainNode: GainNode;
  disposeMediaElement: () => void;
  attachMediaElement: (url: string, trackName: string) => void;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mediaElement(play: () => Promise<void>, currentTime = 1.25) {
  return {
    currentTime,
    pause: vi.fn(),
    play: vi.fn(play),
  } as unknown as HTMLAudioElement;
}

function createHarness(play: () => Promise<void>) {
  const engine = new AudioEngine();
  const internals = engine as unknown as StartInternals;
  const media = mediaElement(play);
  internals.ctx = { state: 'running', resume: vi.fn(async () => {}) };
  internals.mediaElement = media;
  internals._loadedUploadName = 'song.wav';
  internals._trackName = 'song.wav';
  internals._usingUploadedTrack = true;
  internals.ensureContext = vi.fn(async () => {});
  return { engine, media };
}

describe('uploaded playback startup', () => {
  afterEach(() => vi.useRealTimers());

  test('invokes play once and starts without fixed success-path delays or rewinding', async () => {
    vi.useFakeTimers();
    const { engine, media } = createHarness(async () => {});

    await expect(engine.start()).resolves.toBeUndefined();

    expect(media.play).toHaveBeenCalledOnce();
    expect(media.currentTime).toBe(1.25);
    expect(engine.getState()).toMatchObject({
      playing: true,
      usingUploadedTrack: true,
      trackName: 'song.wav',
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('keeps a rejected upload authoritative and stopped instead of switching clocks', async () => {
    const { engine, media } = createHarness(async () => {
      throw new DOMException('gesture rejected', 'NotAllowedError');
    });

    await expect(engine.start()).resolves.toBeUndefined();

    expect(media.play).toHaveBeenCalledOnce();
    expect(media.pause).toHaveBeenCalledOnce();
    expect(engine.getState()).toMatchObject({
      playing: false,
      usingUploadedTrack: true,
      trackName: 'song.wav',
    });
  });

  test('fails closed when context setup throws after gesture-time play', async () => {
    const { engine, media } = createHarness(async () => {});
    const internals = engine as unknown as StartInternals;
    internals.ensureContext = vi.fn(async () => {
      throw new Error('context setup failed');
    });

    await expect(engine.start()).resolves.toBeUndefined();

    expect(media.play).toHaveBeenCalledOnce();
    expect(media.pause).toHaveBeenCalledOnce();
    expect(engine.getState().playing).toBe(false);
  });

  test('fails closed when context setup leaves no current audio context', async () => {
    const { engine, media } = createHarness(async () => {});
    const internals = engine as unknown as StartInternals;
    internals.ctx = null;

    await expect(engine.start()).resolves.toBeUndefined();

    expect(media.play).toHaveBeenCalledOnce();
    expect(media.pause).toHaveBeenCalledOnce();
    expect(engine.getState().playing).toBe(false);
  });

  test('invokes suspended-context resume inside the gesture and fails closed on rejection', async () => {
    const { engine, media } = createHarness(async () => {});
    const internals = engine as unknown as StartInternals;
    const resume = vi.fn(async () => {
      throw new DOMException('resume rejected', 'NotAllowedError');
    });
    internals.ctx = { state: 'suspended', resume };

    const starting = engine.start();
    expect(media.play).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
    await starting;

    expect(media.pause).toHaveBeenCalledOnce();
    expect(engine.getState().playing).toBe(false);
  });

  test('fails closed when resume resolves but the captured context stays suspended', async () => {
    const { engine, media } = createHarness(async () => {});
    const internals = engine as unknown as StartInternals;
    const resume = vi.fn(async () => {});
    internals.ctx = { state: 'suspended', resume };

    await expect(engine.start()).resolves.toBeUndefined();

    expect(resume).toHaveBeenCalledOnce();
    expect(media.pause).toHaveBeenCalledOnce();
    expect(engine.getState().playing).toBe(false);
  });

  test('stop invalidates a pending play before it can activate the timeline', async () => {
    const pending = deferred();
    const { engine, media } = createHarness(() => pending.promise);

    const starting = engine.start();
    engine.stop();
    pending.resolve();
    await starting;

    expect(media.play).toHaveBeenCalledOnce();
    expect(media.pause).toHaveBeenCalled();
    expect(engine.getState()).toMatchObject({ playing: false, usingUploadedTrack: true });
  });

  test('replacement invalidates the old play without pausing the new upload', async () => {
    const pending = deferred();
    const { engine, media: oldMedia } = createHarness(() => pending.promise);
    const internals = engine as unknown as StartInternals;
    const newMedia = mediaElement(async () => {}, 0);
    internals.gainNode = {} as GainNode;
    internals.disposeMediaElement = vi.fn(() => {
      internals.mediaElement = null;
    });
    internals.attachMediaElement = vi.fn((_url, trackName) => {
      internals.mediaElement = newMedia;
      internals._trackName = trackName;
    });

    const starting = engine.start();
    await engine.loadAudioUrl('replacement.wav', 'replacement.wav');
    pending.resolve();
    await starting;

    expect(oldMedia.play).toHaveBeenCalledOnce();
    expect(oldMedia.pause).toHaveBeenCalled();
    expect(newMedia.pause).not.toHaveBeenCalled();
    expect(engine.getState()).toMatchObject({
      playing: false,
      usingUploadedTrack: true,
      trackName: 'replacement.wav',
    });
  });

  test('replacement during pending resume pauses only the old media element', async () => {
    const pendingResume = deferred();
    const { engine, media: oldMedia } = createHarness(async () => {});
    const internals = engine as unknown as StartInternals;
    const context = { state: 'suspended' as AudioContextState, resume: vi.fn(() => pendingResume.promise) };
    const newMedia = mediaElement(async () => {}, 0);
    internals.ctx = context;
    internals.gainNode = {} as GainNode;
    internals.disposeMediaElement = vi.fn(() => {
      internals.mediaElement = null;
    });
    internals.attachMediaElement = vi.fn((_url, trackName) => {
      internals.mediaElement = newMedia;
      internals._trackName = trackName;
    });

    const starting = engine.start();
    expect(oldMedia.play).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
    await engine.loadAudioUrl('replacement.wav', 'replacement.wav');
    context.state = 'running';
    pendingResume.resolve();
    await starting;

    expect(oldMedia.pause).toHaveBeenCalled();
    expect(newMedia.pause).not.toHaveBeenCalled();
    expect(engine.getState()).toMatchObject({
      playing: false,
      usingUploadedTrack: true,
      trackName: 'replacement.wav',
    });
  });

  test('clear disposes a pending element without allowing its play to revive transport', async () => {
    const pending = deferred();
    const { engine, media } = createHarness(() => pending.promise);
    Object.assign(media, { src: 'blob:song', load: vi.fn() });

    const starting = engine.start();
    engine.clearUploadedTrack();
    pending.resolve();
    await starting;

    expect(media.play).toHaveBeenCalledOnce();
    expect(media.pause).toHaveBeenCalled();
    expect(engine.getState()).toMatchObject({
      playing: false,
      usingUploadedTrack: false,
      trackName: '',
    });
  });
});
