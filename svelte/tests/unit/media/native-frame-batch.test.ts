import { describe, expect, test } from 'vitest';
import { decodeNativeFrameBatch } from '$lib/media/nativeFrameBatch';

function packet() {
  const id = new TextEncoder().encode('top-0');
  const pixels = Uint8Array.from([1, 2, 3, 255, 5, 6, 7, 255]);
  const bytes = new Uint8Array(8 + 30 + id.length + pixels.length);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('BSPF'), 0);
  view.setUint16(4, 1, true);
  view.setUint16(6, 1, true);
  let offset = 8;
  view.setUint16(offset, id.length, true); offset += 2;
  view.setUint32(offset, 2, true); offset += 4;
  view.setUint32(offset, 1, true); offset += 4;
  view.setBigInt64(offset, 42n, true); offset += 8;
  view.setBigUint64(offset, 7n, true); offset += 8;
  view.setUint32(offset, pixels.length, true); offset += 4;
  bytes.set(id, offset); offset += id.length;
  bytes.set(pixels, offset);
  return bytes;
}

describe('native frame batch', () => {
  test('decodes raw BGRA payload without base64', () => {
    expect(decodeNativeFrameBatch(packet())).toEqual([{
      kind: 'native-bgra',
      moduleId: 'top-0',
      width: 2,
      height: 1,
      timestampUs: 42,
      sequence: 7,
      data: Uint8Array.from([1, 2, 3, 255, 5, 6, 7, 255])
    }]);
  });

  test('rejects truncated frame payloads', () => {
    expect(() => decodeNativeFrameBatch(packet().subarray(0, 20)))
      .toThrow('native-frame-header-truncated');
  });
});
