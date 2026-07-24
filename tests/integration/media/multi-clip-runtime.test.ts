import { describe, expect, test } from "bun:test";
import { ClipRegistry } from "../../../src/media/ClipRegistry";
import {
  MultiClipPlaybackRuntime,
  type CompatibilityVideoAdapter,
  type MultiClipRendererRuntime,
} from "../../../src/media/MultiClipPlaybackRuntime";
import { PlaybackCoordinator } from "../../../src/media/PlaybackCoordinator";
import { PlaybackPerformanceTracker } from "../../../src/qa/performance";
import type { RenderFrameRequest } from "../../../src/render/contracts";
import { FakeFrame } from "../../unit/media/fakes";

interface FakeVideo {
  clipId: string;
  currentTime: number;
  ready: boolean;
  playing: boolean;
}

const request: RenderFrameRequest = {
  width: 1920,
  height: 1080,
  effect: "timesampler",
  accentMode: "OFF",
  accentEnvelope: 0,
  rgbOffset: 0,
  mix: 1,
};

class FakeRenderer
  implements MultiClipRendererRuntime<FakeFrame, FakeVideo>
{
  disposed = 0;
  presented = 0;

  snapshot() {
    return {
      fallback: {
        path: "html-video-webgl2" as const,
        reason: "sample-frame-probe-failed",
      },
      deviceLost: false,
    };
  }

  presentDecoded() {
    return null;
  }

  presentHtmlVideo() {
    this.presented += 1;
    return true;
  }

  dispose() {
    this.disposed += 1;
  }
}

function setup() {
  const registry = new ClipRegistry();
  for (let index = 0; index < 8; index += 1) {
    registry.registerUrl(
      `clip-${index}`,
      `Clip ${index}`,
      `/fixtures/clip-${index}.mp4`,
    );
  }
  let now = 0;
  let seekCalls = 0;
  const performance = new PlaybackPerformanceTracker(() => now);
  const refs = new Map<string, number>();
  const videos: CompatibilityVideoAdapter<FakeVideo> = {
    acquire(clip) {
      refs.set(clip.id, (refs.get(clip.id) ?? 0) + 1);
      return {
        clipId: clip.id,
        currentTime: 0,
        ready: true,
        playing: false,
      };
    },
    release(clip) {
      const next = Math.max(0, (refs.get(clip.id) ?? 0) - 1);
      if (next === 0) refs.delete(clip.id);
      else refs.set(clip.id, next);
    },
    ready: (video) => video.ready,
    currentTime: (video) => video.currentTime,
    seek: (video, timeSeconds) => {
      seekCalls += 1;
      video.currentTime = timeSeconds;
    },
    setPlaying: (video, playing) => {
      video.playing = playing;
    },
  };
  const coordinator = new PlaybackCoordinator<FakeFrame>();
  const renderer = new FakeRenderer();
  const runtime = new MultiClipPlaybackRuntime({
    registry,
    coordinator,
    renderer,
    videos,
    performance,
  });
  const present = () =>
    runtime.present(
      {
        presentationTimeSeconds: now / 1_000,
        playing: true,
        discontinuityGeneration: 0,
      },
      now / 1_000,
      request,
    );
  return {
    registry,
    coordinator,
    renderer,
    runtime,
    performance,
    refs,
    present,
    seekCalls: () => seekCalls,
    advance(milliseconds: number) {
      now += milliseconds;
    },
  };
}

describe("G007 multi-clip production runtime", () => {
  test("revokes every owned upload URL on replace, remove, and disposal", () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const revoked: string[] = [];
    let nextUrl = 0;
    URL.createObjectURL = () => `blob:clip-${++nextUrl}`;
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
    };

    try {
      const registry = new ClipRegistry();
      registry.registerFile(
        "upload-a",
        new File(["a"], "a.mp4", { type: "video/mp4" }),
      );
      registry.registerFile(
        "upload-a",
        new File(["b"], "b.mp4", { type: "video/mp4" }),
      );
      registry.registerFile(
        "upload-b",
        new File(["c"], "c.mp4", { type: "video/mp4" }),
      );

      expect(revoked).toEqual(["blob:clip-1"]);
      expect(registry.remove("upload-a")).toBe(true);
      expect(revoked).toEqual(["blob:clip-1", "blob:clip-2"]);
      registry.dispose();
      expect(revoked).toEqual([
        "blob:clip-1",
        "blob:clip-2",
        "blob:clip-3",
      ]);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  test("routes eight clips through exactly PGM, prewarm, and overlap roles", () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: "clip-1",
      overlap: "clip-7",
    });
    state.advance(12);
    expect(state.present()).toBe(true);
    expect(state.runtime.snapshot().roles).toEqual({
      pgm: "clip-0",
      prewarm: "clip-1",
      overlap: "clip-7",
    });
    expect(state.coordinator.snapshot()).toMatchObject({
      activeDecoders: 0,
      slots: {
        pgm: { clipId: "clip-0", decoderOpen: false },
        prewarm: { clipId: "clip-1", decoderOpen: false },
        overlap: { clipId: "clip-7", decoderOpen: false },
      },
    });

    expect(() =>
      state.coordinator.activate(
        "fourth" as "pgm",
        "clip-3",
        1,
        null,
      ),
    ).toThrow("fourth-playback-lane-prohibited");
    state.runtime.dispose();
    expect(state.refs.size).toBe(0);
  });

  test("lets playing compatibility video advance without per-frame seeks", () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    state.advance(1_000);
    expect(state.present()).toBe(true);
    expect(state.seekCalls()).toBe(0);

    expect(state.runtime.scrub(4.25, true)).toBe(true);
    expect(state.seekCalls()).toBe(1);
    state.runtime.dispose();
  });

  test("measures deterministic 100-switch and 100-scrub stress without growth", () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: "clip-1",
      overlap: null,
    });
    state.advance(8);
    state.present();

    for (let index = 1; index <= 100; index += 1) {
      const pgm = `clip-${index % 8}`;
      const prewarm = `clip-${(index + 1) % 8}`;
      state.runtime.select({ pgm, prewarm, overlap: null });
      state.advance(8);
      expect(state.present()).toBe(true);
      expect(state.refs.size).toBeLessThanOrEqual(2);
    }

    for (let index = 0; index < 100; index += 1) {
      expect(state.runtime.scrub(index / 10, true)).toBe(true);
      state.advance(7);
      expect(state.present()).toBe(true);
    }
    for (let index = 0; index < 30; index += 1) {
      expect(state.runtime.scrub(index / 5, false)).toBe(true);
      state.advance(16);
      expect(state.present()).toBe(true);
    }

    const metrics = state.performance.snapshot();
    expect(metrics.latency.prewarmedSwitch).toMatchObject({
      count: 100,
      p95Ms: 8,
      failures: 0,
    });
    expect(metrics.latency.cachedScrub).toMatchObject({
      count: 100,
      p95Ms: 7,
      failures: 0,
    });
    expect(metrics.latency.keyframeScrub).toMatchObject({
      count: 30,
      p95Ms: 16,
      failures: 0,
    });
    expect(metrics.frames.lateOrDroppedRatio).toBe(0);
    state.runtime.dispose();
    expect(state.refs.size).toBe(0);
    expect(state.coordinator.snapshot().slots).toEqual({
      pgm: null,
      prewarm: null,
      overlap: null,
    });
  });

  test("removal and renderer disposal release roles within the cleanup budget", () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-3",
      prewarm: "clip-4",
      overlap: "clip-2",
    });
    state.advance(10);
    state.present();
    state.advance(20);
    expect(state.runtime.removeClip("clip-3")).toBe(true);
    expect(state.runtime.snapshot().roles.pgm).toBeNull();
    expect(state.registry.get("clip-3")).toBeNull();
    expect(
      state.performance.snapshot().latency.cleanup.p95Ms,
    ).toBe(0);

    state.runtime.select({
      pgm: "clip-4",
      prewarm: "clip-2",
      overlap: null,
    });
    state.runtime.deactivate();
    expect(state.runtime.snapshot().roles).toEqual({
      pgm: null,
      prewarm: null,
      overlap: null,
    });
    expect(state.refs.size).toBe(0);
    expect(
      state.performance.snapshot().latency.cleanup,
    ).toMatchObject({ count: 2, p95Ms: 0, failures: 0 });

    state.runtime.dispose();
    expect(state.renderer.disposed).toBe(1);
    expect(state.refs.size).toBe(0);
  });
});
