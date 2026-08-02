import { describe, expect, test, vi } from 'vitest';
import { setVideoSourcePortForTests } from '$lib/platform/videoSource';
import type { VideoSourcePort } from '$lib/media/VideoSourcePort';
import type { NativeFrameSurface } from '$lib/media/NativeFrameSurface';
import { TauriNativeSource } from '$lib/media/sources/TauriNativeSource';

describe('TauriNativeSource', () => {
  test('stores native BGRA surfaces keyed by stable slot id', async () => {
    const source = new TauriNativeSource();
    const off = source.onFrame(() => {});
    const surface: NativeFrameSurface = {
      kind: 'native-bgra',
      moduleId: 'top-0',
      width: 2,
      height: 2,
      timestampUs: 0,
      sequence: 1,
      data: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255])
    };
    (source as unknown as { latest: Map<string, NativeFrameSurface> }).latest.set('top-0', surface);
    expect(source.getSurface('top-0')).toEqual(surface);
    off();
    await source.dispose().catch(() => {});
  });

  test('can be injected as the active video source port in tests', () => {
    const stub: VideoSourcePort = {
      kind: 'tauri-native',
      attach: vi.fn(async () => {}),
      getSurface: vi.fn(() => null),
      tick: vi.fn(),
      release: vi.fn(async () => {}),
      dispose: vi.fn(async () => {})
    };
    setVideoSourcePortForTests(stub);
  });
});
