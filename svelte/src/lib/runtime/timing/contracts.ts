export interface TimingTexture {
  view: GPUTextureView;
  pts: number;
  requestedSeconds: number;
  width: number;
  height: number;
  effect: 'ramp' | 'stutter' | 'off';
}
export type TimingTextureProvider = (slotId: string) => TimingTexture | null;
