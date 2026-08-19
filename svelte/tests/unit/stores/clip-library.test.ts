import { beforeEach, describe, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';

const poster = vi.hoisted(() => vi.fn(async () => ({ thumbnail: 'data:image/jpeg;base64,poster', duration: 12 })));
vi.mock('$lib/media/clipThumbnail', () => ({ readClipPoster: poster }));

import {
  addClipsToLibrary,
  addUrlClipsToLibrary,
  clipLibrary
} from '$lib/stores/clipLibrary';

describe('clip library source ownership', () => {
  beforeEach(() => {
    clipLibrary.set([]);
    poster.mockClear();
  });

  test('preserves ordinary File imports on the file source path', async () => {
    const file = new File(['video'], 'local.mp4', { type: 'video/mp4', lastModified: 42 });
    const [clip] = await addClipsToLibrary([file]);
    expect(clip?.source).toEqual({ kind: 'file', file });
    expect(poster).toHaveBeenCalledExactlyOnceWith(file);
  });

  test('represents URL clips without allocating File objects and decodes posters from their URLs', async () => {
    const inputs = Array.from({ length: 13 }, (_, index) => ({
      name: `clip-${index}.mp4`,
      url: `/qa-media/redline/videos/clip-${index}.mp4`
    }));
    const added = await addUrlClipsToLibrary(inputs);
    expect(added).toHaveLength(13);
    expect(get(clipLibrary)).toHaveLength(13);
    expect(added.every((clip) => clip.source.kind === 'url')).toBe(true);
    expect(poster.mock.calls.map((call) => (call as unknown as [File | string])[0])).toEqual(inputs.map(({ url }) => url));
  });
});
