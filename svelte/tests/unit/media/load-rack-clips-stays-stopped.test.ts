import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  start: vi.fn(async () => {}),
  tick: vi.fn(),
  register: vi.fn(async () => ({ status: 'success' as const })),
}));

vi.mock('$lib/audio', () => ({
  audioEngine: {
    getState: () => ({ playing: false }),
    start: mocks.start,
  },
}));
vi.mock('$lib/media/VideoPool', () => ({ videoPool: { tick: mocks.tick } }));
vi.mock('$lib/media/videoFile', () => ({ isVideoFile: () => true }));
vi.mock('$lib/runtime/media/MediaRuntime', () => ({
  mediaRuntime: { registerModuleFileClip: mocks.register },
}));
vi.mock('$lib/stores/rack', () => ({
  activeRackSlotIds: () => ['slot-a'],
  currentRackSlotForModule: (id: string) => id,
  videoLayers: { subscribe: (run: (value: Record<string, unknown>) => void) => {
    run({});
    return () => {};
  } },
}));

import { loadRackClipsFromFiles } from '$lib/media/loadRackClips';

describe('rack clip loading transport contract', () => {
  beforeEach(() => vi.clearAllMocks());

  test('prewarms loaded clips while preserving stopped transport', async () => {
    const result = await loadRackClipsFromFiles([
      new File(['clip'], 'clip.mp4', { type: 'video/mp4' }),
    ]);

    expect(result).toMatchObject({ loaded: 1, targets: ['slot-a'] });
    expect(mocks.register).toHaveBeenCalledOnce();
    expect(mocks.tick).toHaveBeenCalledExactlyOnceWith(true);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
