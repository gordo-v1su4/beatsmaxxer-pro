export interface TimingTexture {
  view: GPUTextureView;
  pts: number;
  requestedSeconds: number;
  width: number;
  height: number;
  effect: 'ramp' | 'stutter' | 'off';
  samplePath?: 'cached-video-texture' | 'resident-frame-bank';
}
export type TimingTextureProvider = (slotId: string) => TimingTexture | null;
