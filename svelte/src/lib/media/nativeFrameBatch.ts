import type { NativeFrameSurface } from '$lib/media/NativeFrameSurface';

const MAGIC = 0x46505342; // "BSPF" as little-endian u32
const HEADER_BYTES = 8;
const FRAME_HEADER_BYTES = 30;

export function decodeNativeFrameBatch(input: ArrayBuffer | Uint8Array | number[]) {
  const bytes = input instanceof Uint8Array
    ? input
    : Array.isArray(input)
      ? Uint8Array.from(input)
      : new Uint8Array(input);
  if (bytes.byteLength === 0) return [];
  if (bytes.byteLength < HEADER_BYTES) throw new Error('native-frame-batch-truncated');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('native-frame-batch-magic');
  if (view.getUint16(4, true) !== 1) throw new Error('native-frame-batch-version');
  const count = view.getUint16(6, true);
  const decoder = new TextDecoder();
  const frames: NativeFrameSurface[] = [];
  let offset = HEADER_BYTES;

  for (let index = 0; index < count; index++) {
    if (offset + FRAME_HEADER_BYTES > bytes.byteLength) {
      throw new Error('native-frame-header-truncated');
    }
    const idLength = view.getUint16(offset, true); offset += 2;
    const width = view.getUint32(offset, true); offset += 4;
    const height = view.getUint32(offset, true); offset += 4;
    const timestampUs = Number(view.getBigInt64(offset, true)); offset += 8;
    const sequence = Number(view.getBigUint64(offset, true)); offset += 8;
    const dataLength = view.getUint32(offset, true); offset += 4;
    if (offset + idLength + dataLength > bytes.byteLength) {
      throw new Error('native-frame-payload-truncated');
    }
    const moduleId = decoder.decode(bytes.subarray(offset, offset + idLength));
    offset += idLength;
    // Keep a view into the raw IPC response; copying every video plane here
    // would double frame traffic before WebGPU even sees it.
    const data = bytes.subarray(offset, offset + dataLength);
    offset += dataLength;
    if (width < 1 || height < 1 || data.byteLength !== width * height * 4) {
      throw new Error('native-frame-dimensions-invalid');
    }
    frames.push({
      kind: 'native-bgra',
      moduleId,
      width,
      height,
      timestampUs,
      sequence,
      data
    });
  }
  return frames;
}
