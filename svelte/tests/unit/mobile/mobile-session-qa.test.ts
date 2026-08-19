import { get, writable } from 'svelte/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const mocks = vi.hoisted(() => ({
  start: vi.fn(async () => {}),
  loadAudioFile: vi.fn(async () => {}),
  register: vi.fn(async () => ({ status: 'success' as const })),
  remove: vi.fn(async () => {}),
  tick: vi.fn()
}));

vi.mock('$lib/modules/catalog', () => ({
  listCatalog: () => [
    { id: 'mirror', name: 'Mirror', category: 'beat', accentColor: '#fff' },
    { id: 'orbit', name: 'Orbit', category: 'camera', accentColor: '#fff' }
  ]
}));

vi.mock('$lib/audio', () => ({
  audioEngine: {
    getState: () => ({ playing: false }),
    start: mocks.start,
    loadAudioFile: mocks.loadAudioFile
  }
}));

vi.mock('$lib/media/VideoPool', () => ({ videoPool: { tick: mocks.tick } }));

vi.mock('$lib/runtime/media/MediaRuntime', () => ({
  mediaRuntime: {
    registerModuleFileClip: mocks.register,
    removeModuleClip: mocks.remove
  }
}));

vi.mock('$lib/stores/rack', async () => {
  const { writable } = await import('svelte/store');
  return {
    rackTop: writable(['mirror']),
    rackBottom: writable(['orbit']),
    videoLayers: writable({}),
  };
});

vi.mock('$lib/stores/pgm', async () => {
  const { writable } = await import('svelte/store');
  return {
    pgmSource: writable('mirror'),
    queuedPgmSource: writable(null),
    autoRandom: writable(false)
  };
});

vi.mock('$lib/stores/clipLibrary', async () => {
  const { get, writable } = await import('svelte/store');
  const clipLibrary = writable<Array<{
    id: string;
    name: string;
    file: File;
    thumbnail: null;
    duration: null;
  }>>([]);

  return {
    clipLibrary,
    addClipsToLibrary: async (files: File[]) => {
      const added = files.map((file) => ({
        id: file.name,
        name: file.name,
        file,
        thumbnail: null,
        duration: null
      }));
      clipLibrary.set([...get(clipLibrary), ...added]);
      return added;
    }
  };
});

vi.mock('$lib/stores/transportDisplay', () => ({
  transportDisplay: writable({ playing: false, beat: 0 })
}));

import {
  MOBILE_SLOT,
  advanceMode,
  advanceStageClip,
  clipQueueIds,
  enterMobileSession,
  seedMobileQaClips,
  stageClipId
} from '$lib/mobile/mobileSession';
import { clipLibrary } from '$lib/stores/clipLibrary';
import { videoLayers } from '$lib/stores/rack';

const CLIP_NAMES = Array.from({ length: 13 }, (_, index) => `redline/video-${index + 1}.mp4`);

describe('mobile real-media QA session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clipLibrary.set([]);
    clipQueueIds.set([]);
    stageClipId.set(null);
    advanceMode.set('hold');
    videoLayers.set({});
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/qa-media/manifest.json') {
        return new Response(JSON.stringify({
          clips: CLIP_NAMES,
          audio: 'redline/song.wav'
        }), { headers: { 'content-type': 'application/json' } });
      }
      if (url.endsWith('.mp4')) {
        return new Response(new Blob(['video'], { type: 'video/mp4' }));
      }
      if (url.endsWith('.wav')) {
        return new Response(new Blob(['audio'], { type: 'audio/wav' }));
      }
      return new Response(null, { status: 404 });
    }));
  });

  test('represents every manifest clip while decoding only the staged slot and staying stopped', async () => {
    await seedMobileQaClips();

    expect(get(clipLibrary)).toHaveLength(13);
    expect(get(clipQueueIds)).toHaveLength(13);
    expect(mocks.register).toHaveBeenCalledExactlyOnceWith(
      MOBILE_SLOT,
      expect.objectContaining({ name: CLIP_NAMES[0] })
    );
    expect(mocks.loadAudioFile).toHaveBeenCalledOnce();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  test('rotates the complete manifest through the same single decoded slot', async () => {
    await seedMobileQaClips();
    advanceMode.set('linear');

    for (let index = 1; index < CLIP_NAMES.length; index += 1) {
      await advanceStageClip(true);
    }

    expect(mocks.register).toHaveBeenCalledTimes(13);
    const registerCalls = mocks.register.mock.calls as unknown as Array<[string, File]>;
    expect(new Set(registerCalls.map(([slot]) => slot))).toEqual(new Set([MOBILE_SLOT]));
    expect(registerCalls.map(([, file]) => file.name)).toEqual(CLIP_NAMES);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  test('removes decoded desktop lanes when the one-slot mobile session begins', () => {
    videoLayers.set({
      [MOBILE_SLOT]: { name: 'mobile', url: 'blob:mobile' },
      'top-1': { name: 'desktop-a', url: 'blob:desktop-a' },
      'bottom-0': { name: 'desktop-b', url: 'blob:desktop-b' }
    });

    const restore = enterMobileSession();

    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledWith('top-1');
    expect(mocks.remove).toHaveBeenCalledWith('bottom-0');
    expect(mocks.remove).not.toHaveBeenCalledWith(MOBILE_SLOT);
    restore();
  });

  test('mounts exactly one live WebGPU canvas in the mobile shell', async () => {
    const [stageSource, shellSource] = await Promise.all([
      readFile(new URL('../../../src/lib/mobile/MobileStage.svelte', import.meta.url), 'utf8'),
      readFile(new URL('../../../src/lib/mobile/MobileShell.svelte', import.meta.url), 'utf8')
    ]);

    expect(stageSource.match(/^\s*<WebGpuCanvas\b/gm)).toHaveLength(1);
    expect(shellSource.match(/^\s*<WebGpuCanvas\b/gm)).toBeNull();
  });
});
