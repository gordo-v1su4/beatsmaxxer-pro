import type { TimelineFrame } from '$lib/transport';
import type { VideoSourcePort } from '$lib/media/VideoSourcePort';
import type { NativeFrameSurface, VideoSurfaceSource } from '$lib/media/NativeFrameSurface';
import { isTauriRuntime } from '$lib/platform/runtime';

type FrameListener = (frame: NativeFrameSurface) => void;

/** Tauri native decode path — consumes RGBA frames from Rust over IPC. */
export class TauriNativeSource implements VideoSourcePort {
  readonly kind = 'tauri-native' as const;
  private latest = new Map<string, NativeFrameSurface>();
  private listeners = new Set<FrameListener>();
  private unlisten: (() => void) | null = null;

  async attach(moduleId: string, path: string) {
    if (!isTauriRuntime()) {
      throw new Error('TauriNativeSource requires the desktop runtime');
    }
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_clip_path', { moduleId, path });
  }

  getSurface(moduleId: string): VideoSurfaceSource | null {
    return this.latest.get(moduleId) ?? null;
  }

  tick(frameOrPlaying: TimelineFrame | boolean) {
    void frameOrPlaying;
    // Native scheduler runs in Rust; the webview only presents the latest frame.
  }

  async release(moduleId: string) {
    if (!isTauriRuntime()) return;
    this.latest.delete(moduleId);
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('release_clip', { moduleId });
  }

  async dispose() {
    this.latest.clear();
    this.unlisten?.();
    this.unlisten = null;
    if (!isTauriRuntime()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('stop_decode');
  }

  /** Wire Tauri event stream once at app startup. */
  async listen() {
    if (!isTauriRuntime() || this.unlisten) return;
    const { listen } = await import('@tauri-apps/api/event');
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('start_decode');
    this.unlisten = await listen<{
      moduleId: string;
      width: number;
      height: number;
      timestampUs: number;
      data: number[];
    }>('bsp://frame', (event) => {
      const payload = event.payload;
      const surface: NativeFrameSurface = {
        kind: 'native-rgba',
        moduleId: payload.moduleId,
        width: payload.width,
        height: payload.height,
        timestampUs: payload.timestampUs,
        data: Uint8ClampedArray.from(payload.data)
      };
      this.latest.set(payload.moduleId, surface);
      for (const listener of this.listeners) listener(surface);
    });
  }

  onFrame(listener: FrameListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const tauriNativeSource = new TauriNativeSource();
