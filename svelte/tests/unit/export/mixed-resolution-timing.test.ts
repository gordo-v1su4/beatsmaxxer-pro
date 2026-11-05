import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

const fixture = vi.hoisted(() => ({
  sources: new Map<string, {width: number; height: number}>(),
  samples: [] as Array<{close: ReturnType<typeof vi.fn>; draw: ReturnType<typeof vi.fn>}>,
}));

// Keep the production take renderer intact; replace only decoded media and the
// browser canvas boundary so these geometry checks run without a GPU/browser.
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class { constructor(public file: File) {} },
  UrlSource: class { constructor(public url: string) {} },
  Input: class {
    constructor(private options: {source: {url: string}}) {}
    dispose = vi.fn();
    async getPrimaryVideoTrack() {
      return {source: this.options.source.url, canDecode: async () => true, getFirstTimestamp: async () => 0};
    }
  },
  VideoSampleSink: class {
    constructor(private track: {source: string}) {}
    async getSample(seconds: number) {
      const size = fixture.sources.get(this.track.source)!;
      const sample = {
        displayWidth: size.width, displayHeight: size.height,
        timestamp: seconds, duration: 1 / 24,
        close: vi.fn(), draw: vi.fn(),
        setTimestamp(value: number) { this.timestamp = value; },
        setDuration(value: number) { this.duration = value; },
      };
      fixture.samples.push(sample);
      return sample;
    }
  },
  VideoSample: class {
    constructor(public canvas: {width: number; height: number}, public timing: {timestamp: number; duration: number}) {}
    get displayWidth() { return this.canvas.width; }
    get displayHeight() { return this.canvas.height; }
    get timestamp() { return this.timing.timestamp; }
    get duration() { return this.timing.duration; }
    close = vi.fn();
  },
}));

import {NativeTimingVideo} from '$lib/export/nativeTimingVideo';

const context = {fillStyle: '', fillRect: vi.fn()};

beforeEach(() => {
  fixture.sources.clear();
  fixture.samples.length = 0;
  context.fillStyle = '';
  context.fillRect.mockClear();
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { return context; }
  });
});
afterEach(() => vi.unstubAllGlobals());

function take(sizes: Array<[number, number]>) {
  const sources = sizes.map(([width, height], index) => {
    const source = `https://media.example/clip-${index}.mp4`;
    fixture.sources.set(source, {width, height});
    return source;
  });
  return new NativeTimingVideo(async timestamp => ({source: sources[Math.min(Math.floor(timestamp), sources.length - 1)], seconds: .5}), new AbortController().signal);
}

describe('mixed-resolution Timing take export characterization', () => {
  // These document the current implicit policy, not approval of source-order
  // dependent delivery dimensions. The policy decision remains explicit below.
  test.each([
    {label: '480p first', sizes: [[854, 480], [1280, 720], [1920, 1080]], expected: [854, 480]},
    {label: '1080p first', sizes: [[1920, 1080], [1280, 720], [854, 480]], expected: [1920, 1080]},
  ])('currently chooses the first source dimensions: $label', async ({sizes, expected}) => {
    const video = take(sizes as Array<[number, number]>);
    try {
      await video.prepare();
      expect([video.width, video.height]).toEqual(expected);
      for (const timestamp of [1, 2]) {
        const frame = await video.frame(timestamp, 1 / 30);
        expect([frame.displayWidth, frame.displayHeight]).toEqual(expected);
        expect(frame.timestamp).toBe(timestamp);
        expect(frame.duration).toBe(1 / 30);
        frame.close();
      }
      expect(fixture.samples.every(sample => sample.close.mock.calls.length === 1)).toBe(true);
    } finally { video.dispose(); }
  });

  test.each([
    {label: '4:3', size: [640, 480], rectangle: [240, 0, 1440, 1080]},
    {label: 'portrait', size: [1080, 1920], rectangle: [656.25, 0, 607.5, 1080]},
    {label: 'square', size: [1080, 1080], rectangle: [420, 0, 1080, 1080]},
    {label: 'ultrawide', size: [1920, 800], rectangle: [0, 140, 1920, 800]},
  ])('contains $label source without distortion and clears letterbox pixels', async ({size, rectangle}) => {
    const video = take([[1920, 1080], size as [number, number]]);
    try {
      await video.prepare();
      const frame = await video.frame(1, 1 / 24);
      expect(context.fillStyle).toBe('#000');
      expect(context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 1920, 1080);
      expect(fixture.samples[1].draw).toHaveBeenCalledExactlyOnceWith(context, ...rectangle);
      expect(fixture.samples[1].close).toHaveBeenCalledOnce();
      expect([frame.displayWidth, frame.displayHeight, frame.timestamp]).toEqual([1920, 1080, 1]);
      frame.close();
    } finally { video.dispose(); }
  });

  test.todo('use an explicit take output size so the same mixed-resolution clips export identically after reordering the opening cut');
});
