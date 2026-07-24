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
import {
  circularMediaTimeDistance,
  resetPresentedVideoCadence,
  rvfcPresentationIsAuthoritative,
  rvfcValidityDeadlineMs,
} from "../../../src/media/BrowserProgramRenderer";

interface FakeVideo {
  clipId: string;
  url: string;
  currentTime: number;
  clockTime: number;
  playbackRate: number;
  ready: boolean;
  playing: boolean;
  pendingSeekTarget: number | null;
  pendingSeekFrames: number;
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
    videoFrameRate?: number;
    seekLatencyFrames?: () => number;
    rvfcLagSeconds?: number;
    rvfcAgeSeconds?: number;
    rvfcAuthoritative?: boolean;
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
        clockTime: now / 1_000,
        playbackRate: 1,
        ready: true,
        playing: false,
        pendingSeekTarget: null,
        pendingSeekFrames: 0,
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
    seeking: (video) => video.pendingSeekTarget !== null,
    currentTime: (video) => video.currentTime,
    presentationTolerance: () =>
      options.videoFrameRate
        ? 1 / options.videoFrameRate
        : 1 / 30,
    presentedTimeMatches: options.videoFrameRate
      ? (video, targetTime) =>
          Math.abs(
            video.currentTime -
              (options.rvfcLagSeconds ?? 0) -
              targetTime,
          ) <=
          1 / options.videoFrameRate! + 1e-9
      : undefined,
    presentationDiagnostics: (video) => ({
      presentedMediaTime:
        video.currentTime - (options.rvfcLagSeconds ?? 0),
      frameDurationSeconds: options.videoFrameRate
        ? 1 / options.videoFrameRate
        : null,
      durationSeconds: null,
      playbackRate: video.playbackRate,
      rvfcAgeSeconds: options.rvfcAgeSeconds ?? 0,
      rvfcValidUntilMs:
        options.rvfcAuthoritative === false ? -1 : 1_000,
      rvfcFresh: options.rvfcAuthoritative !== false,
      rvfcAuthoritative: options.rvfcAuthoritative ?? true,
      displayedFrameCountAtCallback: 10,
      displayedFrameCount:
        options.rvfcAuthoritative === false ? 11 : 10,
      rvfcExpired: options.rvfcAuthoritative === false,
      rvfcSuperseded: options.rvfcAuthoritative === false,
      latestRawDeltaSeconds: options.videoFrameRate
        ? 1 / options.videoFrameRate
        : null,
      callbackSequence: Math.floor(
        now / (1_000 / (options.videoFrameRate ?? 30)),
      ),
    }),
    seek: (video, timeSeconds) => {
      seekCalls += 1;
      const latencyFrames = Math.max(
        0,
        Math.floor(options.seekLatencyFrames?.() ?? 0),
      );
      if (latencyFrames === 0) {
        video.currentTime = timeSeconds;
        video.clockTime = timeSeconds;
      } else {
        video.pendingSeekTarget = timeSeconds;
        video.pendingSeekFrames = latencyFrames;
      }
    },
    setPlaying: (video, playing) => {
      video.playing = playing;
    },
    setPlaybackRate: (video, playbackRate) => {
      video.playbackRate = playbackRate;
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
      playbackRate?: number;
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
        playbackRate: overrides.playbackRate,
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
    setReady(ready: boolean) {
      for (const video of activeVideos) video.ready = ready;
    },
    shiftVideoTime(seconds: number) {
      for (const video of activeVideos) {
        video.currentTime += seconds;
        video.clockTime += seconds;
      }
    },
    videoTime() {
      return [...activeVideos][0]?.currentTime ?? 0;
    },
    advance(milliseconds: number) {
      now += milliseconds;
      for (const video of activeVideos) {
        if (video.pendingSeekTarget !== null) {
          video.pendingSeekFrames -= 1;
          if (video.pendingSeekFrames <= 0) {
            video.currentTime = video.pendingSeekTarget;
            video.clockTime = video.pendingSeekTarget;
            video.pendingSeekTarget = null;
          }
          continue;
        }
        if (video.playing) {
          video.clockTime +=
            (milliseconds / 1_000) * video.playbackRate;
          video.currentTime = options.videoFrameRate
            ? Math.floor(
                (video.clockTime + 1e-9) * options.videoFrameRate,
              ) / options.videoFrameRate
            : video.clockTime;
        }
      }
    },
  };
}

describe("G007 multi-clip production runtime", () => {
  test("uses circular fallback distance and clears stale cadence on seek", () => {
    expect(circularMediaTimeDistance(10, 9.99, 0.01)).toBeCloseTo(
      0.02,
    );
    expect(circularMediaTimeDistance(10, 9.99, 0.01)).toBeLessThan(
      1 / 30,
    );
    expect(circularMediaTimeDistance(10, 9.8, 0)).toBeCloseTo(0.2);

    const cadence = {
      previousMediaTime: 4.966,
      presentedMediaTime: 5,
      frameDurationSeconds: 1 / 30,
    };
    resetPresentedVideoCadence(cadence);
    expect(cadence).toEqual({
      previousMediaTime: null,
      presentedMediaTime: null,
      frameDurationSeconds: 1 / 30,
    });

    expect(rvfcValidityDeadlineMs(1_000, 1 / 24, 1.0025)).toBeCloseTo(
      1_041.56276,
    );
    expect(
      rvfcPresentationIsAuthoritative({
        hasPresentation: true,
        paused: false,
        expired: false,
        displayedFrameCountAtCallback: 10,
        displayedFrameCount: 10,
      }),
    ).toBe(true);
    expect(
      rvfcPresentationIsAuthoritative({
        hasPresentation: true,
        paused: false,
        expired: true,
        displayedFrameCountAtCallback: 10,
        displayedFrameCount: 11,
      }),
    ).toBe(false);
    expect(
      rvfcPresentationIsAuthoritative({
        hasPresentation: true,
        paused: false,
        expired: true,
        displayedFrameCountAtCallback: 10,
        displayedFrameCount: 10,
      }),
    ).toBe(true);
    expect(
      rvfcPresentationIsAuthoritative({
        hasPresentation: true,
        paused: true,
        expired: true,
        displayedFrameCountAtCallback: 10,
        displayedFrameCount: 11,
      }),
    ).toBe(true);
    expect(
      rvfcPresentationIsAuthoritative({
        hasPresentation: true,
        paused: false,
        expired: true,
        displayedFrameCountAtCallback: null,
        displayedFrameCount: null,
      }),
    ).toBe(true);
  });

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
    expect(
      state.performance.snapshot().frames.droppedByReason[
        "steady-drift"
      ],
    ).toBe(1);
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

  test("records one reason per continuous steady failure episode", async () => {
    const state = setup();
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(state.present()).toBe(true);

    state.setReady(false);
    for (let frame = 0; frame < 120; frame += 1) {
      expect(state.present()).toBe(false);
    }
    expect(state.performance.snapshot().frames).toMatchObject({
      dropped: 1,
      droppedByReason: {
        "video-not-ready": 1,
      },
    });

    state.setReady(true);
    expect(state.present()).toBe(true);
    state.setReady(false);
    expect(state.present()).toBe(false);
    expect(state.performance.snapshot().frames).toMatchObject({
      dropped: 2,
      droppedByReason: {
        "video-not-ready": 2,
      },
    });
    await state.runtime.dispose();
  });

  test("retains at most 20 secret-free steady-drift diagnostics", async () => {
    const state = setup({ videoFrameRate: 30 });
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(state.present()).toBe(true);

    for (let episode = 1; episode <= 25; episode += 1) {
      const targetTime = state.videoTime();
      state.shiftVideoTime(0.2);
      expect(
        state.present({
          sourceTimeSeconds: targetTime,
          sourceGeneration: 7,
          playbackRate: 1.0025,
        }),
      ).toBe(false);
      expect(
        state.present({
          sourceTimeSeconds: targetTime,
          sourceGeneration: 7,
          playbackRate: 1.0025,
        }),
      ).toBe(true);
    }

    const diagnostics =
      state.runtime.snapshot().steadyDriftDiagnostics;
    expect(diagnostics.capacity).toBe(20);
    expect(diagnostics.totalEpisodes).toBe(25);
    expect(diagnostics.records).toHaveLength(20);
    expect(diagnostics.records[0]?.episode).toBe(6);
    expect(diagnostics.records[19]?.episode).toBe(25);
    expect(diagnostics.retainedDistanceSeconds.min).toBeCloseTo(0.2);
    expect(diagnostics.retainedDistanceSeconds.p50).toBeCloseTo(0.2);
    expect(diagnostics.retainedDistanceSeconds.max).toBeCloseTo(0.2);
    expect(diagnostics.records[0]).toMatchObject({
      targetTimeSeconds: 0,
      currentTimeSeconds: 0.2,
      presentedMediaTimeSeconds: 0.2,
      frameDurationSeconds: 1 / 30,
      presentationToleranceSeconds: 1 / 30,
      currentDistanceSeconds: 0.2,
      presentedDistanceSeconds: 0.2,
      durationSeconds: null,
      sourceGeneration: 7,
      previousSourceGeneration: 7,
      discontinuityGeneration: 0,
      previousDiscontinuityGeneration: 0,
      requestedPlaybackRate: 1.0025,
      actualPlaybackRate: 1.0025,
      seekInFlight: false,
      transportTimeSeconds: 0,
      sourceTimeSeconds: 0,
    });
    expect(JSON.stringify(diagnostics)).not.toContain("/fixtures/");
    const decisions =
      state.runtime.snapshot().htmlDecisionDiagnostics;
    expect(decisions.capacity).toBe(512);
    expect(decisions.freezeAfterDriftEpisodes).toBe(16);
    expect(decisions.frozen).toBe(true);
    expect(decisions.recordedDecisions).toBe(32);
    expect(decisions.records).toHaveLength(32);
    expect(decisions.records.at(-1)).toMatchObject({
      outcome: "steady-drift",
      basis: "rvfc",
      clipId: "clip-0",
      rvfcFresh: true,
      rvfcAuthoritative: true,
      rvfcExpired: false,
      rvfcSuperseded: false,
    });
    await state.runtime.dispose();
  });

  test("uses RVFC while authoritative and current time only after supersession", async () => {
    const fresh = setup({
      videoFrameRate: 24,
      rvfcLagSeconds: 0.05,
      rvfcAgeSeconds: 0.01,
      rvfcAuthoritative: true,
    });
    fresh.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(fresh.present({ sourceTimeSeconds: 0 })).toBe(false);
    expect(
      fresh.runtime.snapshot().htmlDecisionDiagnostics.records.at(-1),
    ).toMatchObject({
      outcome: "deliberate-seek",
      basis: "rvfc",
      currentDistanceSeconds: 0,
      presentedDistanceSeconds: 0.05,
      rvfcAuthoritative: true,
    });
    await fresh.runtime.dispose();

    const superseded = setup({
      videoFrameRate: 24,
      rvfcLagSeconds: 0.05,
      rvfcAgeSeconds: 0.05,
      rvfcAuthoritative: false,
    });
    superseded.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });
    expect(superseded.present({ sourceTimeSeconds: 0 })).toBe(true);
    expect(
      superseded.runtime
        .snapshot()
        .htmlDecisionDiagnostics.records.at(-1),
    ).toMatchObject({
      outcome: "accepted",
      basis: "current-time-stale-rvfc",
      currentDistanceSeconds: 0,
      presentedDistanceSeconds: 0.05,
      rvfcExpired: true,
      rvfcSuperseded: true,
    });
    superseded.shiftVideoTime(0.2);
    expect(superseded.present({ sourceTimeSeconds: 0 })).toBe(false);
    expect(
      superseded.runtime
        .snapshot()
        .htmlDecisionDiagnostics.records.at(-1),
    ).toMatchObject({
      outcome: "steady-drift",
      basis: "current-time-stale-rvfc",
      currentDistanceSeconds: 0.2,
    });
    await superseded.runtime.dispose();
  });

  test("keeps 24, 30, and 60fps presented intervals below 1% over 60 seconds", async () => {
    for (const [frameRate, playbackRate] of [
      [24, 1.5],
      [30, 1.0025],
      [60, 0.5],
    ] as const) {
      const state = setup({ videoFrameRate: frameRate });
      state.runtime.select({
        pgm: "clip-0",
        prewarm: null,
        overlap: null,
      });
      expect(state.present({ playbackRate })).toBe(true);
      let sourceTimeSeconds = 0;

      for (let frame = 0; frame < 3_600; frame += 1) {
        state.advance(1_000 / 60);
        sourceTimeSeconds += playbackRate / 60;
        expect(
          state.present({
            sourceTimeSeconds,
            playbackRate,
            sourceGeneration: 0,
          }),
        ).toBe(true);
      }

      const frames = state.performance.snapshot().frames;
      expect(frames.lateOrDroppedRatio).toBeLessThanOrEqual(0.01);
      expect(frames.droppedByReason).toEqual({
        "decoded-unavailable": 0,
        "decoded-off-target": 0,
        "video-not-ready": 0,
        "steady-drift": 0,
        "renderer-rejected": 0,
      });
      await state.runtime.dispose();
    }
  });

  test("keeps beat seeks, delayed recovery, and clock phase below 1% over 60 seconds", async () => {
    const seekLatencies = [1, 2, 3];
    let nextSeekLatency = 0;
    const state = setup({
      videoFrameRate: 30,
      seekLatencyFrames: () =>
        seekLatencies[nextSeekLatency++ % seekLatencies.length],
      rvfcLagSeconds: 0.04,
      rvfcAgeSeconds: 0.05,
      rvfcAuthoritative: false,
    });
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });

    const playbackRate = 1.0025;
    let sourceTimeSeconds = 0;
    let sourceGeneration = 0;
    let recoveryTarget: number | null = null;
    expect(state.present({ playbackRate, sourceGeneration })).toBe(true);

    for (let frame = 1; frame <= 3_600; frame += 1) {
      state.advance(1_000 / 60);
      if (recoveryTarget === null) {
        sourceTimeSeconds += playbackRate / 60;
      }

      if (recoveryTarget === null && frame % 30 === 0) {
        sourceGeneration += 1;
        sourceTimeSeconds += 0.75;
        recoveryTarget = sourceTimeSeconds;
      } else if (
        recoveryTarget === null &&
        (frame === 905 || frame === 1_661 || frame === 2_713)
      ) {
        recoveryTarget = state.videoTime();
        state.shiftVideoTime(0.2);
      }

      const phaseJitter = frame % 2 === 0 ? -0.004 : 0.004;
      const presented = state.present({
        sourceTimeSeconds:
          recoveryTarget ?? state.videoTime() + phaseJitter,
        sourceGeneration,
        playbackRate,
        late: recoveryTarget !== null,
      });
      if (presented && recoveryTarget !== null) {
        recoveryTarget = null;
      }
    }

    const frames = state.performance.snapshot().frames;
    expect(frames.presented).toBeGreaterThan(3_000);
    expect(frames.late).toBe(0);
    expect(frames.dropped).toBe(3);
    expect(frames.lateOrDroppedRatio).toBeLessThanOrEqual(0.01);
    expect(frames.droppedByReason).toEqual({
      "decoded-unavailable": 0,
      "decoded-off-target": 0,
      "video-not-ready": 0,
      "steady-drift": 3,
      "renderer-rejected": 0,
    });
    const decisions =
      state.runtime.snapshot().htmlDecisionDiagnostics;
    expect(decisions.frozen).toBe(false);
    expect(decisions.recordedDecisions).toBe(3_601);
    expect(decisions.records).toHaveLength(512);
    expect(
      decisions.records.some(
        (decision) =>
          decision.basis === "current-time-stale-rvfc",
      ),
    ).toBe(true);
    await state.runtime.dispose();
  });

  test("rejects 200ms drift even with a derived 10fps interval", async () => {
    const state = setup({ videoFrameRate: 10 });
    state.runtime.select({
      pgm: "clip-0",
      prewarm: null,
      overlap: null,
    });

    expect(state.present({ sourceTimeSeconds: 0.2 })).toBe(false);
    expect(state.renderer.presented).toBe(0);
    expect(state.seekCalls()).toBe(1);
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
