import { describe, expect, test } from "bun:test";
import { ClipRegistry } from "../../../src/media/ClipRegistry";
import {
  MultiClipPlaybackRuntime,
  type CompatibilityVideoAdapter,
  type MultiClipRendererRuntime,
} from "../../../src/media/MultiClipPlaybackRuntime";
import { PlaybackCoordinator } from "../../../src/media/PlaybackCoordinator";
import {
  PresentationReceipt,
  type FrameLease,
} from "../../../src/media/FrameCache";
import { PlaybackPerformanceTracker } from "../../../src/qa/performance";
import type { RenderFrameRequest } from "../../../src/render/contracts";
import type { MediaFallback } from "../../../src/media/types";
import { FakeFrame } from "../../unit/media/fakes";

interface FakeVideo {
  clipId: string;
  url: string;
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
  decodedPresented = 0;
  decoded = false;
  forcedFallbacks = 0;
  fallback: MediaFallback = {
    path: "html-video-webgl2",
    reason: "sample-frame-probe-failed",
  };

  snapshot() {
    return {
      fallback: this.fallback,
      deviceLost: false,
    };
  }

  presentDecoded(lease: FrameLease<FakeFrame>) {
    if (!this.decoded) return null;
    this.decodedPresented += 1;
    return {
      path: "webcodecs-webgl2" as const,
      receipt: PresentationReceipt.submitted(lease),
    };
  }

  presentHtmlVideo() {
    this.presented += 1;
    return true;
  }

  forceCompatibilityFallback(reason: string) {
    this.forcedFallbacks += 1;
    this.fallback = {
      path: "html-video-webgl2",
      reason,
    };
    return true;
  }

  dispose() {
    this.disposed += 1;
  }
}

function setup(
  options: {
    releaseGate?: Promise<void>;
    cleanupTimeoutMs?: number;
    decoded?: boolean;
  } = {},
) {
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
  let acquisitions = 0;
  const performance = new PlaybackPerformanceTracker(() => now);
  const refs = new Map<string, number>();
  const activeVideos = new Set<FakeVideo>();
  const videos: CompatibilityVideoAdapter<FakeVideo> = {
    acquire(clip) {
      acquisitions += 1;
      refs.set(clip.url, (refs.get(clip.url) ?? 0) + 1);
      const video = {
        clipId: clip.id,
        url: clip.url,
        currentTime: now / 1_000,
        ready: true,
        playing: false,
      };
      activeVideos.add(video);
      return video;
    },
    release(clip, video) {
      const finish = () => {
        activeVideos.delete(video);
        const next = Math.max(0, (refs.get(clip.url) ?? 0) - 1);
        if (next === 0) refs.delete(clip.url);
        else refs.set(clip.url, next);
      };
      return options.releaseGate?.then(finish) ?? finish();
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
  if (options.decoded) {
    renderer.decoded = true;
    renderer.fallback = {
      path: "webcodecs-webgl2",
      reason: null,
    };
  }
  const runtime = new MultiClipPlaybackRuntime({
    registry,
    coordinator,
    renderer,
    videos,
    performance,
    cleanupTimeoutMs: options.cleanupTimeoutMs,
  });
  const present = (
    overrides: {
      sourceTimeSeconds?: number;
      sourceGeneration?: number;
      discontinuityGeneration?: number;
      playing?: boolean;
      late?: boolean;
    } = {},
  ) =>
    runtime.present(
      {
        presentationTimeSeconds: now / 1_000,
        playing: overrides.playing ?? true,
        discontinuityGeneration:
          overrides.discontinuityGeneration ?? 0,
      },
      overrides.sourceTimeSeconds ?? now / 1_000,
      request,
      {
        sourceGeneration: overrides.sourceGeneration,
        late: overrides.late,
      },
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
    acquisitions: () => acquisitions,
    advance(milliseconds: number) {
      now += milliseconds;
      for (const video of activeVideos) {
        if (video.playing) video.currentTime += milliseconds / 1_000;
      }
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

  test("validates uploads before URL allocation and revokes failed registrations", () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const revoked: string[] = [];
    let allocations = 0;
    URL.createObjectURL = () => `blob:failed-${++allocations}`;
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
    };

    try {
      const registry = new ClipRegistry();
      expect(() =>
        registry.registerFile(
          "",
          new File(["a"], "a.mp4", { type: "video/mp4" }),
        ),
      ).toThrow("clip-id-required");
      expect(allocations).toBe(0);

      const failingRegistry = new ClipRegistry(() => {
        throw new Error("telemetry-failed");
      });
      expect(() =>
        failingRegistry.registerFile(
          "upload",
          new File(["b"], "b.mp4", { type: "video/mp4" }),
        ),
      ).toThrow("telemetry-failed");
      expect(revoked).toEqual(["blob:failed-1"]);
      expect(failingRegistry.get("upload")).toBeNull();
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  test("replaces a live role when the same clip id receives a new source", async () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(state.present()).toBe(true);
    const firstSource = state.runtime.snapshot().roleSources.pgm;
    expect(state.refs.has("/fixtures/clip-0.mp4")).toBe(true);

    state.registry.registerUrl(
      "clip-0",
      "Replacement",
      "/fixtures/replacement.mp4",
    );
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(state.runtime.snapshot().roleSources.pgm).not.toBe(
      firstSource,
    );
    expect(state.refs.has("/fixtures/clip-0.mp4")).toBe(false);
    expect(state.refs.has("/fixtures/replacement.mp4")).toBe(true);
    await state.runtime.dispose();
  });

  test("routes eight clips through exactly PGM, prewarm, and overlap roles", async () => {
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
    await state.runtime.dispose();
    expect(state.refs.size).toBe(0);
  });

  test("lets playing compatibility video advance without per-frame seeks", async () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(state.present()).toBe(true);
    state.advance(1_000);
    expect(state.present()).toBe(true);
    expect(state.seekCalls()).toBe(0);

    expect(state.runtime.scrub(4.25, true)).toBe(true);
    expect(state.seekCalls()).toBe(1);
    await state.runtime.dispose();
  });

  test("seeks HTML fallback once per deterministic jump and transport discontinuity", async () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(
      state.present({
        sourceTimeSeconds: 0,
        sourceGeneration: 0,
      }),
    ).toBe(true);

    expect(
      state.present({
        sourceTimeSeconds: 3,
        sourceGeneration: 1,
      }),
    ).toBe(false);
    expect(state.seekCalls()).toBe(1);
    expect(
      state.present({
        sourceTimeSeconds: 3,
        sourceGeneration: 1,
      }),
    ).toBe(true);
    expect(state.seekCalls()).toBe(1);

    expect(
      state.present({
        sourceTimeSeconds: 5,
        sourceGeneration: 1,
        discontinuityGeneration: 2,
      }),
    ).toBe(false);
    expect(state.seekCalls()).toBe(2);
    await state.runtime.dispose();
  });

  test("rejects an HTML frame 200ms off target before settling switch latency", async () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    state.advance(8);

    expect(
      state.present({
        sourceTimeSeconds: 0.2,
        sourceGeneration: 1,
      }),
    ).toBe(false);
    expect(state.seekCalls()).toBe(1);
    expect(state.renderer.presented).toBe(0);
    expect(
      state.performance.snapshot().latency.coldSwitch,
    ).toMatchObject({ count: 0, failures: 0 });

    state.advance(8);
    expect(
      state.present({
        sourceTimeSeconds: 0.2,
        sourceGeneration: 1,
      }),
    ).toBe(true);
    expect(state.seekCalls()).toBe(1);
    expect(
      state.performance.snapshot().latency.coldSwitch,
    ).toMatchObject({ count: 1, p95Ms: 16, failures: 0 });
    await state.runtime.dispose();
  });

  test("caps decoded presentation acceptance to one frame cadence", async () => {
    const state = setup({ decoded: true });
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    const lane = state.coordinator.getLane("pgm");
    expect(lane).not.toBeNull();
    expect(
      state.coordinator.insertFrame(
        "pgm",
        {
          clipId: "clip-0",
          generation: lane!.generation,
          timestampUs: 0,
        },
        new FakeFrame(0, 100_000),
      ),
    ).toBe(true);

    expect(state.present({ sourceTimeSeconds: 0.09 })).toBe(false);
    expect(state.renderer.decodedPresented).toBe(0);
    expect(
      state.performance.snapshot().latency.coldSwitch,
    ).toMatchObject({ count: 0, failures: 0 });

    expect(state.present({ sourceTimeSeconds: 0.02 })).toBe(true);
    expect(state.renderer.decodedPresented).toBe(1);
    expect(
      state.performance.snapshot().latency.coldSwitch,
    ).toMatchObject({ count: 1, failures: 0 });
    await state.runtime.dispose();
  });

  test("promotes the warmed video without reacquiring or restarting its load", async () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: "clip-1",
      overlap: null,
    });
    expect(state.acquisitions()).toBe(2);
    expect(state.present()).toBe(true);

    state.runtime.select({
      pgm: "clip-1",
      prewarm: "clip-2",
      overlap: null,
    });
    expect(state.acquisitions()).toBe(3);
    expect(state.runtime.snapshot().roles).toEqual({
      pgm: "clip-1",
      prewarm: "clip-2",
      overlap: null,
    });
    state.advance(8);
    expect(state.present()).toBe(true);
    expect(
      state.performance.snapshot().latency.prewarmedSwitch,
    ).toMatchObject({ count: 1, p95Ms: 8, failures: 0 });
    await state.runtime.dispose();
  });

  test("records unresolved scrub latency as failure on deactivate and dispose", async () => {
    const deactivated = setup();
    deactivated.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(deactivated.present()).toBe(true);
    expect(deactivated.runtime.scrub(2, true)).toBe(true);
    await deactivated.runtime.deactivate();
    expect(
      deactivated.performance.snapshot().latency.cachedScrub,
    ).toMatchObject({ count: 0, failures: 1 });
    await deactivated.runtime.dispose();

    const disposed = setup();
    disposed.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(disposed.present()).toBe(true);
    expect(disposed.runtime.scrub(3, false)).toBe(true);
    await disposed.runtime.dispose();
    expect(
      disposed.performance.snapshot().latency.keyframeScrub,
    ).toMatchObject({ count: 0, failures: 1 });
  });

  test("keeps transition waits out of steady-state frame-drop telemetry", async () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(state.present()).toBe(true);

    state.runtime.select({
      pgm: "clip-1",
      prewarm: null,
      overlap: null,
    });
    expect(
      state.present({
        sourceTimeSeconds: 0.2,
        sourceGeneration: 1,
      }),
    ).toBe(false);
    state.advance(50);
    expect(
      state.present({
        sourceTimeSeconds: 0.2,
        sourceGeneration: 1,
        playing: true,
        late: true,
      }),
    ).toBe(true);
    expect(state.performance.snapshot().frames).toMatchObject({
      presented: 2,
      late: 0,
      dropped: 0,
      lateOrDroppedRatio: 0,
    });

    state.advance(50);
    expect(
      state.present({
        sourceTimeSeconds: 1,
        sourceGeneration: 1,
      }),
    ).toBe(false);
    expect(state.performance.snapshot().frames.dropped).toBe(1);
    await state.runtime.dispose();
  });

  test("counts one steady miss but not deliberate jump recovery frames", async () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(
      state.present({
        sourceTimeSeconds: 0,
        sourceGeneration: 0,
      }),
    ).toBe(true);

    expect(
      state.present({
        sourceTimeSeconds: 1,
        sourceGeneration: 1,
      }),
    ).toBe(false);
    state.advance(50);
    expect(
      state.present({
        sourceTimeSeconds: 1.05,
        sourceGeneration: 1,
        late: true,
      }),
    ).toBe(true);
    expect(state.performance.snapshot().frames).toMatchObject({
      presented: 2,
      late: 0,
      dropped: 0,
    });

    expect(
      state.present({
        sourceTimeSeconds: 2,
        sourceGeneration: 1,
      }),
    ).toBe(false);
    expect(state.performance.snapshot().frames.dropped).toBe(1);
    state.advance(50);
    expect(
      state.present({
        sourceTimeSeconds: 2.05,
        sourceGeneration: 1,
        late: true,
      }),
    ).toBe(true);
    expect(state.performance.snapshot().frames).toMatchObject({
      presented: 3,
      late: 0,
      dropped: 1,
      lateOrDroppedRatio: 0.25,
    });
    await state.runtime.dispose();
  });

  test("wires all pressure stages through runtime and observable telemetry", async () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: "clip-1",
      overlap: "clip-2",
    });
    expect([
      state.runtime.degradeForPressure(),
      state.runtime.degradeForPressure(),
      state.runtime.degradeForPressure(),
      state.runtime.degradeForPressure(),
      state.runtime.degradeForPressure(),
    ]).toEqual([
      "inactive-cache-evicted",
      "prewarm-frames-dropped",
      "prewarm-decoder-closed",
      "overlap-disabled",
      "html-fallback-selected",
    ]);
    const snapshot = state.runtime.snapshot();
    expect(snapshot.coordinator.pressure).toEqual({
      stage: 5,
      count: 5,
      lastAction: "html-fallback-selected",
    });
    expect(snapshot.roles.overlap).toBeNull();
    expect(snapshot.coordinator.slots.pgm).toMatchObject({
      clipId: "clip-0",
      decoderOpen: false,
    });
    expect(snapshot.renderer.fallback).toEqual({
      path: "html-video-webgl2",
      reason: "decoded-frame-pressure",
    });
    expect(state.renderer.forcedFallbacks).toBe(1);
    await state.runtime.dispose();
  });

  test("measures deterministic 100-switch and 100-scrub stress without growth", async () => {
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
      const target = index / 10;
      expect(state.runtime.scrub(target, true)).toBe(true);
      state.advance(7);
      expect(
        state.present({ sourceTimeSeconds: target + 0.007 }),
      ).toBe(true);
    }
    for (let index = 0; index < 30; index += 1) {
      const target = index / 5;
      expect(state.runtime.scrub(target, false)).toBe(true);
      state.advance(16);
      expect(
        state.present({ sourceTimeSeconds: target + 0.016 }),
      ).toBe(true);
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
    await state.runtime.dispose();
    expect(state.refs.size).toBe(0);
    expect(state.coordinator.snapshot().slots).toEqual({
      pgm: null,
      prewarm: null,
      overlap: null,
    });
  });

  test("removal and renderer disposal release roles within the cleanup budget", async () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-3",
      prewarm: "clip-4",
      overlap: "clip-2",
    });
    state.advance(10);
    state.present();
    state.advance(20);
    expect(await state.runtime.removeClip("clip-3")).toBe(true);
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
    await state.runtime.deactivate();
    expect(state.runtime.snapshot().roles).toEqual({
      pgm: null,
      prewarm: null,
      overlap: null,
    });
    expect(state.refs.size).toBe(0);
    expect(
      state.performance.snapshot().latency.cleanup,
    ).toMatchObject({ count: 2, p95Ms: 0, failures: 0 });

    await state.runtime.dispose();
    expect(state.renderer.disposed).toBe(1);
    expect(state.refs.size).toBe(0);
  });

  test("settles cleanup only after resources release and fails bounded timeout", async () => {
    let releaseGate = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const state = setup({ releaseGate: gate });
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    state.present();
    const cleanup = state.runtime.deactivate();
    await Promise.resolve();
    expect(state.performance.snapshot().latency.cleanup.count).toBe(0);
    expect(state.refs.size).toBe(1);
    releaseGate();
    expect(await cleanup).toBe(true);
    expect(state.refs.size).toBe(0);
    expect(
      state.performance.snapshot().latency.cleanup,
    ).toMatchObject({ count: 1, failures: 0 });
    await state.runtime.dispose();

    const never = new Promise<void>(() => {});
    const timedOut = setup({
      releaseGate: never,
      cleanupTimeoutMs: 5,
    });
    timedOut.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(await timedOut.runtime.deactivate()).toBe(false);
    expect(
      timedOut.performance.snapshot().latency.cleanup,
    ).toMatchObject({ count: 0, failures: 1 });
  });

  test("dispose aborts and accounts for a never-resolving prior-role replacement", async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const revoked: string[] = [];
    let allocation = 0;
    URL.createObjectURL = () => `blob:replacement-${++allocation}`;
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
    };

    try {
      const never = new Promise<void>(() => {});
      const state = setup({
        releaseGate: never,
        cleanupTimeoutMs: 5,
      });
      state.registry.registerFile(
        "clip-0",
        new File(["first"], "first.mp4", { type: "video/mp4" }),
      );
      state.runtime.select({
        pgm: "clip-0",
        prewarm: null,
        overlap: null,
      });
      expect(state.present()).toBe(true);

      state.registry.registerFile(
        "clip-0",
        new File(["second"], "second.mp4", {
          type: "video/mp4",
        }),
      );
      state.runtime.select({
        pgm: "clip-0",
        prewarm: null,
        overlap: null,
      });
      expect(revoked).toEqual([]);

      await state.runtime.dispose();
      expect(state.renderer.disposed).toBe(1);
      expect(revoked).toEqual(["blob:replacement-1"]);
      expect(
        state.performance.snapshot().latency.cleanup,
      ).toMatchObject({ count: 0, failures: 1 });

      state.registry.dispose();
      expect(revoked).toEqual([
        "blob:replacement-1",
        "blob:replacement-2",
      ]);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
