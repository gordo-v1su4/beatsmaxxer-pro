import { get, writable } from 'svelte/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const mocks = vi.hoisted(() => ({
  start: vi.fn(async () => {}),
  loadAudioFile: vi.fn(async () => {}),
  registerFile: vi.fn(async () => ({ status: 'success' as const })),
  registerUrl: vi.fn(async () => ({ status: 'success' as const })),
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
    registerModuleFileClip: mocks.registerFile,
    registerModuleClip: mocks.registerUrl,
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
    source: { kind: 'file'; file: File } | { kind: 'url'; url: string };
    thumbnail: null;
    duration: null;
  }>>([]);

  return {
    clipLibrary,
    addUrlClipsToLibrary: async (inputs: Array<{ name: string; url: string }>) => {
      const added = inputs.map(({ name, url }) => ({
        id: `url:${url}`,
        name,
        source: { kind: 'url' as const, url },
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
  loadStageClip,
  seedMobileQaClips,
  stageClipId
} from '$lib/mobile/mobileSession';
import { clipLibrary } from '$lib/stores/clipLibrary';
import { rackBottom, videoLayers } from '$lib/stores/rack';

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
    expect(mocks.registerUrl).toHaveBeenCalledExactlyOnceWith(
      MOBILE_SLOT,
      'video-1.mp4',
      `/qa-media/${CLIP_NAMES[0]}`
    );
    const fetchCalls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(fetchCalls.filter((url) => url.endsWith('.mp4'))).toEqual([]);
    expect(mocks.loadAudioFile).toHaveBeenCalledOnce();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  test('rotates the complete manifest through the same single decoded slot', async () => {
    await seedMobileQaClips();
    advanceMode.set('linear');

    for (let index = 1; index < CLIP_NAMES.length; index += 1) {
      await advanceStageClip(true);
    }

    expect(mocks.registerUrl).toHaveBeenCalledTimes(13);
    const registerCalls = mocks.registerUrl.mock.calls as unknown as Array<[string, string, string]>;
    expect(new Set(registerCalls.map(([slot]) => slot))).toEqual(new Set([MOBILE_SLOT]));
    expect(registerCalls.map(([, name]) => `redline/${name}`)).toEqual(CLIP_NAMES);
    expect(registerCalls.map(([, , url]) => url)).toEqual(CLIP_NAMES.map((name) => `/qa-media/${name}`));
    expect(mocks.start).not.toHaveBeenCalled();
  });

  test('keeps ordinary File clips on the existing File registration path', async () => {
    const file = new File(['video'], 'local.mp4', { type: 'video/mp4' });
    await loadStageClip({
      id: 'local', name: file.name, source: { kind: 'file', file }, thumbnail: null, duration: null
    });
    expect(mocks.registerFile).toHaveBeenCalledExactlyOnceWith(MOBILE_SLOT, file);
    expect(mocks.registerUrl).not.toHaveBeenCalled();
  });

  test('awaits decoded desktop lane removal before exposing the one-slot mobile session', async () => {
    videoLayers.set({
      [MOBILE_SLOT]: { name: 'mobile', url: 'blob:mobile' },
      'top-1': { name: 'desktop-a', url: 'blob:desktop-a' },
      'bottom-0': { name: 'desktop-b', url: 'blob:desktop-b' }
    });

    let finishFirstRemoval!: () => void;
    mocks.remove.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirstRemoval = resolve; }));
    const entering = enterMobileSession();

    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledWith('top-1');
    expect(mocks.remove).toHaveBeenCalledWith('bottom-0');
    expect(mocks.remove).not.toHaveBeenCalledWith(MOBILE_SLOT);
    expect(get(rackBottom)).toEqual(['orbit']);
    finishFirstRemoval();
    const restore = await entering;
    expect(get(rackBottom)).toEqual([]);
    restore();
  });

  test('keeps a stale session restore from overwriting a newer mobile session', async () => {
    const firstRestore = await enterMobileSession();
    const secondRestore = await enterMobileSession();
    rackBottom.set(['sentinel']);
    firstRestore();
    expect(get(rackBottom)).toEqual(['sentinel']);
    secondRestore();
    expect(get(rackBottom)).toEqual([]);
    expect(mocks.remove).not.toHaveBeenCalledWith(MOBILE_SLOT);
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
