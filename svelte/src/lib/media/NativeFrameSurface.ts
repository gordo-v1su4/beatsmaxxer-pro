/** Native decode frame surface delivered from Tauri/Rust over IPC. */
export interface NativeFrameSurface {
  kind: 'native-bgra';
  moduleId: string;
  width: number;
  height: number;
  timestampUs: number;
  sequence: number;
  /** Packed BGRA8 row-major pixels from CoreVideo. */
  data: Uint8Array;
}

export function isNativeFrameSurface(value: unknown): value is NativeFrameSurface {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as NativeFrameSurface).kind === 'native-bgra' &&
    (value as NativeFrameSurface).data instanceof Uint8Array
  );
}

/** Video input accepted by WebGpuEngine presenters. */
export type VideoSurfaceSource = HTMLVideoElement | NativeFrameSurface;

export function isHtmlVideoSource(value: VideoSurfaceSource): value is HTMLVideoElement {
  return typeof HTMLVideoElement !== 'undefined' && value instanceof HTMLVideoElement;
}
