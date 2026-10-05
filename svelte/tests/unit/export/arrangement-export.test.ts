import { describe, expect, test } from 'vitest';
import { exportFileName, pickRecorderMime, resolveExportRange } from '$lib/export/arrangementExport';

describe('arrangement export helpers', () => {
  test('prefers VP9 WebM, falls back down the list, null when nothing records', () => {
    expect(pickRecorderMime(() => true)).toBe('video/webm;codecs=vp9,opus');
    expect(pickRecorderMime((m) => m === 'video/webm')).toBe('video/webm');
    expect(pickRecorderMime((m) => m.startsWith('video/mp4'))).toBe('video/mp4;codecs=avc1,mp4a');
    expect(pickRecorderMime(() => false)).toBeNull();
  });

  test('song range is the whole track; loop range needs a real loop', () => {
    expect(resolveExportRange('song', 180, null)).toEqual({ startSeconds: 0, endSeconds: 180 });
    expect(resolveExportRange('song', 0, null)).toBeNull();
    expect(resolveExportRange('loop', 180, { startSeconds: 30, endSeconds: 60 })).toEqual({ startSeconds: 30, endSeconds: 60 });
    expect(resolveExportRange('loop', 180, null)).toBeNull();
    expect(resolveExportRange('loop', 50, { startSeconds: 30, endSeconds: 60 })).toEqual({ startSeconds: 30, endSeconds: 50 });
  });

  test('file name carries the container extension', () => {
    const at = new Date('2026-10-05T23:10:00Z');
    expect(exportFileName('video/webm;codecs=vp9,opus', at)).toBe('beatsmaxxer-2026-10-05-23-10-00.webm');
    expect(exportFileName('video/mp4', at)).toBe('beatsmaxxer-2026-10-05-23-10-00.mp4');
  });
});
