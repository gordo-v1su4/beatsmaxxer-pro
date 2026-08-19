import { afterEach, describe, expect, test, vi } from 'vitest';
import { AudioEngine } from '$lib/audio/AudioEngine';

interface StartInternals {
  ctx: { state: AudioContextState; resume: () => Promise<void> };
  mediaElement: HTMLAudioElement;
  _loadedUploadName: string;
  _trackName: string;
  _usingUploadedTrack: boolean;
  ensureContext: () => Promise<void>;
}

function createHarness(play: () => Promise<void>) {
  const engine = new AudioEngine();
  const internals = engine as unknown as StartInternals;
  const media = {
    currentTime: 1.25,
    pause: vi.fn(),
    play: vi.fn(play),
  } as unknown as HTMLAudioElement;
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
});
