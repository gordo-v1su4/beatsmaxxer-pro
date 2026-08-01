/** Native decode frame surface delivered from Tauri/Rust over IPC. */
export interface NativeFrameSurface {
  kind: 'native-rgba';
  moduleId: string;
  width: number;
  height: number;
  timestampUs: number;
  /** Packed RGBA8 row-major pixels. */
  data: Uint8ClampedArray;
}

export function isNativeFrameSurface(value: unknown): value is NativeFrameSurface {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as NativeFrameSurface).kind === 'native-rgba' &&
    (value as NativeFrameSurface).data instanceof Uint8ClampedArray
  );
}

/** Video input accepted by WebGpuEngine presenters. */
export type VideoSurfaceSource = HTMLVideoElement | NativeFrameSurface;

export function isHtmlVideoSource(value: VideoSurfaceSource): value is HTMLVideoElement {
  return typeof HTMLVideoElement !== 'undefined' && value instanceof HTMLVideoElement;
}
