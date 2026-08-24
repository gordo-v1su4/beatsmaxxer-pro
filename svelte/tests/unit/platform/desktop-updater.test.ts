import { describe, expect, test } from 'vitest';
import {
  downloadPercent,
  reduceDownloadProgress,
  type DownloadProgress
} from '$lib/platform/desktopUpdater';

describe('desktop updater progress', () => {
  const empty = (): DownloadProgress => ({ downloadedBytes: 0, finished: false });

  test('accumulates chunks and reports bounded percentages', () => {
    let progress = reduceDownloadProgress(empty(), {
      event: 'Started',
      data: { contentLength: 100 }
    });
    progress = reduceDownloadProgress(progress, { event: 'Progress', data: { chunkLength: 42 } });
    expect(downloadPercent(progress)).toBe(42);

    progress = reduceDownloadProgress(progress, { event: 'Progress', data: { chunkLength: 100 } });
    expect(downloadPercent(progress)).toBe(100);
  });

  test('handles unknown lengths and finishes honestly', () => {
    let progress = reduceDownloadProgress(empty(), { event: 'Started', data: {} });
    progress = reduceDownloadProgress(progress, { event: 'Progress', data: { chunkLength: 512 } });
    expect(downloadPercent(progress)).toBeNull();

    progress = reduceDownloadProgress(progress, { event: 'Finished' });
    expect(progress.finished).toBe(true);
    expect(downloadPercent(progress)).toBe(100);
  });
});
