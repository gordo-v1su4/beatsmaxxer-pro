import type { ClipTiming } from './envelope';

export interface TimingTexture {
  view: GPUTextureView;
  pts: number;
  requestedSeconds: number;
  width: number;
  height: number;
  effect: ClipTiming['effect'];
  samplePath?: 'cached-video-texture' | 'resident-frame-bank';
  sampler?: { controls: Record<string,number>; accentTime: number | null; jump: number; slice: number; slices: number };
}
export type TimingTextureProvider = (slotId: string) => TimingTexture | null;
