export interface OwnedVideoFrame {
  view: GPUTextureView;
  pts: number;
  frameId: number;
  width: number;
  height: number;
}
export type OwnedVideoFrameProvider = (sourceId: string) => OwnedVideoFrame | null;
