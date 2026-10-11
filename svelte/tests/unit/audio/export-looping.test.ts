import { expect, test, vi } from 'vitest';
import { AudioEngine } from '$lib/audio/AudioEngine';
import { audioTimeline } from '$lib/transport/AudioTimeline';

test('export temporarily disables media looping and restores it exactly once', async () => {
  const subscription = vi.spyOn(audioTimeline, 'subscribe').mockReturnValue(() => {});
  const looping = vi.spyOn(audioTimeline, 'setLooping').mockImplementation(() => {});
  const engine = new AudioEngine();
  const media = { loop: true };
  Object.assign(engine, { mediaElement: media });
  try {
    const restore = engine.suspendTrackLooping();
    expect(media.loop).toBe(false);
    expect(looping).toHaveBeenLastCalledWith(false);
    restore();
    restore();
    expect(media.loop).toBe(true);
    expect(looping.mock.calls).toEqual([[false], [true]]);
  } finally {
    Object.assign(engine, { mediaElement: null });
    await engine.dispose();
    subscription.mockRestore();
    looping.mockRestore();
  }
});

test('a finishing export cannot change the loop state of a replacement song', async () => {
  const subscription = vi.spyOn(audioTimeline, 'subscribe').mockReturnValue(() => {});
  const looping = vi.spyOn(audioTimeline, 'setLooping').mockImplementation(() => {});
  const engine = new AudioEngine();
  Object.assign(engine, { mediaElement: { loop: true } });
  try {
    const restore = engine.suspendTrackLooping();
    const replacement = { loop: false };
    Object.assign(engine, { mediaElement: replacement });
    restore();
    expect(replacement.loop).toBe(false);
    expect(looping.mock.calls).toEqual([[false]]);
  } finally {
    Object.assign(engine, { mediaElement: null });
    await engine.dispose();
    subscription.mockRestore();
    looping.mockRestore();
  }
});
