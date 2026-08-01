import type { TimelineFrame } from '$lib/transport';
import type { VideoSurfaceSource } from '$lib/media/NativeFrameSurface';

/** Decode/presentation port — HTMLVideo on web, native IPC on Tauri. */
export interface VideoSourcePort {
  readonly kind: 'html-video' | 'tauri-native';
  attach(moduleId: string, url: string): Promise<void>;
  getSurface(moduleId: string): VideoSurfaceSource | null;
  tick(frameOrPlaying: TimelineFrame | boolean): void;
  release(moduleId: string): Promise<void>;
  dispose(): Promise<void>;
}
