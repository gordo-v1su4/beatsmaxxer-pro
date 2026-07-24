import type { RenderFrameRequest } from "../render/contracts";
import type {
  DecodedFrameSubmission,
  RendererRuntimeSnapshot,
} from "../render/contracts";
import type { FrameLease } from "./FrameCache";
import {
  PlaybackPerformanceTracker,
  type PlaybackLatencyKind,
} from "../qa/performance";
import type { ClipRegistry, RegisteredClip } from "./ClipRegistry";
import type {
  PlaybackCoordinator,
  PlaybackLaneRole,
  PlaybackTransportState,
  PressureAction,
} from "./PlaybackCoordinator";
import type { DecodedFrameLike } from "./types";

export interface CompatibilityVideoAdapter<Video extends object> {
  acquire(clip: RegisteredClip): Video;
  release(
    clip: RegisteredClip,
    video: Video,
    signal?: AbortSignal,
  ): void | Promise<void>;
  ready(video: Video): boolean;
  seeking?(video: Video): boolean;
  currentTime(video: Video): number;
  normalizeTime?(video: Video, timeSeconds: number): number;
  seek(video: Video, timeSeconds: number): void;
  setPlaying(video: Video, playing: boolean): void;
}

interface ActiveRole<Video extends object> {
  clip: RegisteredClip;
  video: Video;
  generation: number;
  lastSourceGeneration: number | null;
  lastDiscontinuityGeneration: number | null;
  lastFallbackSeekAtSeconds: number | null;
}

export interface MultiClipRoleSelection {
  pgm: string | null;
  prewarm: string | null;
  overlap: string | null;
}

export interface MultiClipRendererRuntime<
  Frame extends DecodedFrameLike,
  Video extends object,
> {
  snapshot(): RendererRuntimeSnapshot;
  presentDecoded(
    lease: FrameLease<Frame>,
    request: RenderFrameRequest,
  ): DecodedFrameSubmission<Frame> | null;
  presentHtmlVideo(video: Video, request: RenderFrameRequest): boolean;
  forceCompatibilityFallback(reason: string): boolean;
  dispose(): void;
}

const CLEANUP_TIMEOUT_MS = 1_950;
const PLAYING_DRIFT_TOLERANCE_SECONDS = 0.25;

export class MultiClipPlaybackRuntime<
  Frame extends DecodedFrameLike,
  Video extends object,
> {
  private readonly roles = new Map<
    PlaybackLaneRole,
    ActiveRole<Video>
  >();
  private generation = 0;
  private pendingPresentation:
    | ReturnType<PlaybackPerformanceTracker["begin"]>
    | null = null;
  private pendingSourceKey: string | null = null;
  private hasPresented = false;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(
    private readonly options: {
      registry: ClipRegistry;
      coordinator: PlaybackCoordinator<Frame>;
      renderer: MultiClipRendererRuntime<Frame, Video>;
      videos: CompatibilityVideoAdapter<Video>;
      performance?: PlaybackPerformanceTracker;
      cleanupTimeoutMs?: number;
    },
  ) {}

  select(
    selection: MultiClipRoleSelection,
    latencyKind: PlaybackLatencyKind = "coldSwitch",
  ) {
    this.assertOpen();
    const uniqueIds = {
      pgm: selection.pgm,
      prewarm:
        selection.prewarm && selection.prewarm !== selection.pgm
          ? selection.prewarm
          : null,
      overlap:
        selection.overlap &&
        selection.overlap !== selection.pgm &&
        selection.overlap !== selection.prewarm
          ? selection.overlap
          : null,
    };
    const unique = {
      pgm: uniqueIds.pgm
        ? this.options.registry.get(uniqueIds.pgm)
        : null,
      prewarm: uniqueIds.prewarm
        ? this.options.registry.get(uniqueIds.prewarm)
        : null,
      overlap: uniqueIds.overlap
        ? this.options.registry.get(uniqueIds.overlap)
        : null,
    };
    if (
      this.sameSource(this.roles.get("pgm"), unique.pgm) &&
      this.sameSource(this.roles.get("prewarm"), unique.prewarm) &&
      this.sameSource(this.roles.get("overlap"), unique.overlap)
    ) {
      return;
    }
    const wasPrewarmed =
      unique.pgm !== null &&
      this.sameSource(this.roles.get("prewarm"), unique.pgm);
    const desiredSourceKey = this.sourceKey(unique.pgm);
    if (
      this.pendingPresentation?.settled === false &&
      this.pendingSourceKey !== desiredSourceKey
    ) {
      this.options.performance?.fail(this.pendingPresentation);
      this.pendingPresentation = null;
      this.pendingSourceKey = null;
    }
    if (!this.pendingPresentation && unique.pgm !== null) {
      this.pendingPresentation = this.options.performance?.begin(
        wasPrewarmed ? "prewarmedSwitch" : latencyKind,
      ) ?? null;
      this.pendingSourceKey = desiredSourceKey;
    }

    this.syncRole("pgm", unique.pgm);
    this.syncRole("prewarm", unique.prewarm);
    this.syncRole("overlap", unique.overlap);
  }

  scrub(timeSeconds: number, cached: boolean) {
    this.assertOpen();
    const pgm = this.roles.get("pgm");
    if (!pgm) return false;
    this.pendingPresentation?.settled === false &&
      this.options.performance?.fail(this.pendingPresentation);
    this.pendingPresentation = this.options.performance?.begin(
      cached ? "cachedScrub" : "keyframeScrub",
    ) ?? null;
    this.pendingSourceKey = this.sourceKey(pgm.clip);
    pgm.generation = ++this.generation;
    pgm.lastSourceGeneration = null;
    pgm.lastFallbackSeekAtSeconds = null;
    this.options.coordinator.setLaneGeneration(
      "pgm",
      pgm.generation,
    );
    this.options.videos.seek(pgm.video, Math.max(0, timeSeconds));
    return true;
  }

  present(
    transport: PlaybackTransportState,
    sourceTimeSeconds: number,
    request: RenderFrameRequest,
    options: {
      late?: boolean;
      sourceGeneration?: number;
    } = {},
  ) {
    this.assertOpen();
    this.options.coordinator.updateTransport(transport);
    const pgm = this.roles.get("pgm");
    if (!pgm) return false;

    const fallback = this.options.renderer.snapshot().fallback.path;
    if (
      fallback === "webcodecs-webgpu" ||
      fallback === "webcodecs-webgl2"
    ) {
      const lease = this.options.coordinator.leaseFrame(
        "pgm",
        Math.round(sourceTimeSeconds * 1_000_000),
        "multi-clip-renderer",
      );
      if (!lease) {
        if (transport.playing) {
          this.options.performance?.recordFrame({ dropped: true });
        }
        return false;
      }
      const submission = this.options.renderer.presentDecoded(
        lease,
        request,
      );
      if (!submission) {
        if (transport.playing) {
          this.options.performance?.recordFrame({ dropped: true });
        }
        return false;
      }
      submission.receipt.release();
    } else {
      if (
        !this.options.videos.ready(pgm.video) ||
        this.options.videos.seeking?.(pgm.video)
      ) {
        if (transport.playing && this.hasPresented) {
          this.options.performance?.recordFrame({ dropped: true });
        }
        return false;
      }
      const currentTime = this.options.videos.currentTime(pgm.video);
      const targetTime =
        this.options.videos.normalizeTime?.(
          pgm.video,
          sourceTimeSeconds,
        ) ?? sourceTimeSeconds;
      const drift = Math.abs(currentTime - targetTime);
      const sourceGeneration = options.sourceGeneration ?? null;
      const sourceJump =
        sourceGeneration !== null &&
        sourceGeneration !== pgm.lastSourceGeneration;
      const discontinuity =
        transport.discontinuityGeneration !==
        pgm.lastDiscontinuityGeneration;
      const boundedDrift =
        transport.playing &&
        drift > PLAYING_DRIFT_TOLERANCE_SECONDS &&
        (pgm.lastFallbackSeekAtSeconds === null ||
          transport.presentationTimeSeconds -
            pgm.lastFallbackSeekAtSeconds >=
            PLAYING_DRIFT_TOLERANCE_SECONDS);
      if (
        ((sourceJump || discontinuity) && drift > 1 / 30) ||
        (!transport.playing && drift > 1 / 30) ||
        boundedDrift
      ) {
        this.options.videos.seek(pgm.video, targetTime);
        pgm.lastFallbackSeekAtSeconds =
          transport.presentationTimeSeconds;
        pgm.lastSourceGeneration = sourceGeneration;
        pgm.lastDiscontinuityGeneration =
          transport.discontinuityGeneration;
        return false;
      }
      pgm.lastSourceGeneration = sourceGeneration;
      pgm.lastDiscontinuityGeneration =
        transport.discontinuityGeneration;
      this.options.videos.setPlaying(pgm.video, transport.playing);
      if (!this.options.renderer.presentHtmlVideo(pgm.video, request)) {
        if (transport.playing) {
          this.options.performance?.recordFrame({ dropped: true });
        }
        return false;
      }
    }

    const late =
      transport.playing && this.hasPresented && options.late;
    this.hasPresented = true;
    this.options.performance?.recordFrame({ late });
    if (this.pendingPresentation) {
      this.options.performance?.succeed(this.pendingPresentation);
      this.pendingPresentation = null;
      this.pendingSourceKey = null;
    }
    return true;
  }

  async removeClip(id: string) {
    this.assertOpen();
    const cleanup = this.options.performance?.begin("cleanup") ?? null;
    const controller = new AbortController();
    const releases: Promise<void>[] = [];
    for (const [role, active] of this.roles) {
      if (active.clip.id === id) {
        releases.push(this.releaseRole(role, controller.signal));
      }
    }
    const completed = await this.awaitCleanup(
      releases,
      controller,
      cleanup,
    );
    const removed = this.options.registry.remove(id);
    return removed && completed;
  }

  async deactivate() {
    this.assertOpen();
    const cleanup = this.options.performance?.begin("cleanup") ?? null;
    const controller = new AbortController();
    this.pendingPresentation = null;
    this.pendingSourceKey = null;
    this.hasPresented = false;
    const releases = (
      ["pgm", "prewarm", "overlap"] as const
    ).map((role) => this.releaseRole(role, controller.signal));
    return this.awaitCleanup(releases, controller, cleanup);
  }

  degradeForPressure(): PressureAction {
    this.assertOpen();
    const action = this.options.coordinator.degradeForPressure();
    if (action === "overlap-disabled") {
      void this.releaseRole("overlap", undefined, true);
    } else if (action === "html-fallback-selected") {
      this.options.renderer.forceCompatibilityFallback(
        "decoded-frame-pressure",
      );
      const pgm = this.roles.get("pgm");
      if (pgm) {
        this.options.coordinator.activate(
          "pgm",
          pgm.clip.id,
          pgm.generation,
          null,
        );
      }
    }
    return action;
  }

  snapshot() {
    return {
      roles: {
        pgm: this.roles.get("pgm")?.clip.id ?? null,
        prewarm: this.roles.get("prewarm")?.clip.id ?? null,
        overlap: this.roles.get("overlap")?.clip.id ?? null,
      },
      roleSources: {
        pgm: this.sourceKey(this.roles.get("pgm")?.clip ?? null),
        prewarm: this.sourceKey(
          this.roles.get("prewarm")?.clip ?? null,
        ),
        overlap: this.sourceKey(
          this.roles.get("overlap")?.clip ?? null,
        ),
      },
      coordinator: this.options.coordinator.snapshot(),
      renderer: this.options.renderer.snapshot(),
      performance: this.options.performance?.snapshot() ?? null,
    };
  }

  dispose() {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.pendingPresentation = null;
    this.pendingSourceKey = null;
    this.hasPresented = false;
    const controller = new AbortController();
    const cleanup = this.options.performance?.begin("cleanup") ?? null;
    const releases = (
      ["pgm", "prewarm", "overlap"] as const
    ).map((role) => this.releaseRole(role, controller.signal));
    this.disposePromise = this.awaitCleanup(
      releases,
      controller,
      cleanup,
    ).then(() => {
      this.options.renderer.dispose();
      this.options.coordinator.dispose();
    });
    return this.disposePromise;
  }

  private syncRole(
    role: PlaybackLaneRole,
    clip: RegisteredClip | null,
  ) {
    const current = this.roles.get(role);
    if (this.sameSource(current, clip)) return;
    void this.releaseRole(role);
    if (!clip) return;
    const generation = ++this.generation;
    this.options.registry.retain(clip);
    let video: Video;
    try {
      video = this.options.videos.acquire(clip);
    } catch (error) {
      this.options.registry.releaseReference(clip);
      throw error;
    }
    this.roles.set(role, {
      clip,
      video,
      generation,
      lastSourceGeneration: null,
      lastDiscontinuityGeneration: null,
      lastFallbackSeekAtSeconds: null,
    });
    this.options.coordinator.activate(
      role,
      clip.id,
      generation,
      null,
    );
  }

  private async releaseRole(
    role: PlaybackLaneRole,
    signal?: AbortSignal,
    coordinatorAlreadyReleased = false,
  ) {
    const active = this.roles.get(role);
    if (!active) return;
    this.roles.delete(role);
    if (!coordinatorAlreadyReleased) {
      this.options.coordinator.deactivate(role);
    }
    try {
      await this.options.videos.release(
        active.clip,
        active.video,
        signal,
      );
    } finally {
      this.options.registry.releaseReference(active.clip);
    }
  }

  private sameSource(
    active: ActiveRole<Video> | undefined,
    clip: RegisteredClip | null,
  ) {
    if (!active || !clip) return !active && clip === null;
    return (
      active.clip.id === clip.id &&
      active.clip.revision === clip.revision &&
      active.clip.url === clip.url
    );
  }

  private sourceKey(clip: RegisteredClip | null) {
    return clip ? `${clip.id}:${clip.revision}:${clip.url}` : null;
  }

  private async awaitCleanup(
    releases: Promise<void>[],
    controller: AbortController,
    token:
      | ReturnType<PlaybackPerformanceTracker["begin"]>
      | null,
  ) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const timedOut = new Promise<false>((resolve) => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve(false);
      }, Math.min(
        CLEANUP_TIMEOUT_MS,
        Math.max(0, this.options.cleanupTimeoutMs ?? CLEANUP_TIMEOUT_MS),
      ));
    });
    const released = Promise.allSettled(releases).then((results) =>
      results.every((result) => result.status === "fulfilled"),
    );
    const completed = await Promise.race([released, timedOut]);
    if (timeout !== null) clearTimeout(timeout);
    if (token) {
      if (completed) this.options.performance?.succeed(token);
      else this.options.performance?.fail(token);
    }
    return completed;
  }

  private assertOpen() {
    if (this.disposed) throw new Error("multi-clip-runtime-disposed");
  }
}
