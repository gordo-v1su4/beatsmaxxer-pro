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
  timeDistance?(
    video: Video,
    currentTimeSeconds: number,
    targetTimeSeconds: number,
  ): number;
  seek(video: Video, timeSeconds: number): void;
  setPlaying(video: Video, playing: boolean): void;
}

interface ActiveRole<Video extends object> {
  clip: RegisteredClip;
  video: Video;
  generation: number;
  lastSourceGeneration: number | null;
  lastDiscontinuityGeneration: number | null;
  seekInFlight: boolean;
}

interface TrackedRelease {
  clipId: string;
  controller: AbortController;
  promise: Promise<boolean>;
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
const PRESENTATION_TOLERANCE_SECONDS = 1 / 30;

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
  private pendingLaneGeneration: number | null = null;
  private hasPresented = false;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;
  private readonly releases = new Set<TrackedRelease>();

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
      this.cancelPendingPresentation();
    }
    if (!this.pendingPresentation && unique.pgm !== null) {
      this.pendingPresentation = this.options.performance?.begin(
        wasPrewarmed ? "prewarmedSwitch" : latencyKind,
      ) ?? null;
      this.pendingSourceKey = desiredSourceKey;
    }

    if (wasPrewarmed && unique.pgm) {
      this.promotePrewarmToPgm(unique.pgm);
    } else {
      this.syncRole("pgm", unique.pgm);
    }
    this.syncRole("prewarm", unique.prewarm);
    this.syncRole("overlap", unique.overlap);
    this.pendingLaneGeneration = this.pendingPresentation
      ? this.roles.get("pgm")?.generation ?? null
      : null;
  }

  scrub(timeSeconds: number, cached: boolean) {
    this.assertOpen();
    const pgm = this.roles.get("pgm");
    if (!pgm) return false;
    this.cancelPendingPresentation();
    this.pendingPresentation = this.options.performance?.begin(
      cached ? "cachedScrub" : "keyframeScrub",
    ) ?? null;
    this.pendingSourceKey = this.sourceKey(pgm.clip);
    pgm.generation = ++this.generation;
    this.pendingLaneGeneration = pgm.generation;
    pgm.lastSourceGeneration = null;
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
    let settlesIntentionalSeek = false;

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
        this.recordDroppedFrame(transport);
        return false;
      }
      const targetTimestampUs = Math.round(
        sourceTimeSeconds * 1_000_000,
      );
      const frame = lease.frame;
      const presentationToleranceUs =
        PRESENTATION_TOLERANCE_SECONDS * 1_000_000;
      const frameDurationUs =
        frame.duration && frame.duration > 0
          ? Math.min(frame.duration, presentationToleranceUs)
          : presentationToleranceUs;
      if (
        targetTimestampUs < frame.timestamp ||
        targetTimestampUs >= frame.timestamp + frameDurationUs
      ) {
        lease.release();
        this.recordDroppedFrame(transport);
        return false;
      }
      const submission = this.options.renderer.presentDecoded(
        lease,
        request,
      );
      if (!submission) {
        this.recordDroppedFrame(transport);
        return false;
      }
      submission.receipt.release();
    } else {
      if (
        !this.options.videos.ready(pgm.video) ||
        this.options.videos.seeking?.(pgm.video)
      ) {
        if (!pgm.seekInFlight) this.recordDroppedFrame(transport);
        return false;
      }
      const currentTime = this.options.videos.currentTime(pgm.video);
      const targetTime =
        this.options.videos.normalizeTime?.(
          pgm.video,
          sourceTimeSeconds,
        ) ?? sourceTimeSeconds;
      const drift =
        this.options.videos.timeDistance?.(
          pgm.video,
          currentTime,
          targetTime,
        ) ?? Math.abs(currentTime - targetTime);
      const sourceGeneration = options.sourceGeneration ?? null;
      if (drift > PRESENTATION_TOLERANCE_SECONDS) {
        const deliberateDiscontinuity =
          (pgm.lastSourceGeneration !== null &&
            sourceGeneration !== null &&
            sourceGeneration !== pgm.lastSourceGeneration) ||
          (pgm.lastDiscontinuityGeneration !== null &&
            transport.discontinuityGeneration !==
              pgm.lastDiscontinuityGeneration);
        if (!deliberateDiscontinuity && !pgm.seekInFlight) {
          this.recordDroppedFrame(transport);
        }
        this.options.videos.seek(pgm.video, targetTime);
        pgm.seekInFlight = true;
        pgm.lastSourceGeneration = sourceGeneration;
        pgm.lastDiscontinuityGeneration =
          transport.discontinuityGeneration;
        return false;
      }
      settlesIntentionalSeek = pgm.seekInFlight;
      pgm.seekInFlight = false;
      pgm.lastSourceGeneration = sourceGeneration;
      pgm.lastDiscontinuityGeneration =
        transport.discontinuityGeneration;
      this.options.videos.setPlaying(pgm.video, transport.playing);
      if (!this.options.renderer.presentHtmlVideo(pgm.video, request)) {
        this.recordDroppedFrame(transport);
        return false;
      }
    }

    const settlesPendingPresentation =
      this.pendingPresentation !== null &&
      this.pendingLaneGeneration === pgm.generation;
    const late =
      !settlesPendingPresentation &&
      !settlesIntentionalSeek &&
      transport.playing &&
      this.hasPresented &&
      options.late;
    this.hasPresented = true;
    this.options.performance?.recordFrame({ late });
    if (this.pendingPresentation) {
      if (settlesPendingPresentation) {
        this.options.performance?.succeed(this.pendingPresentation);
      } else {
        this.options.performance?.fail(this.pendingPresentation);
      }
      this.pendingPresentation = null;
      this.pendingSourceKey = null;
      this.pendingLaneGeneration = null;
    }
    return true;
  }

  async removeClip(id: string) {
    this.assertOpen();
    const requestedClip = this.options.registry.get(id);
    if (!requestedClip) return false;
    if (this.roles.get("pgm")?.clip.id === id) {
      this.cancelPendingPresentation();
    }
    const cleanup = this.options.performance?.begin("cleanup") ?? null;
    const releases: TrackedRelease[] = [];
    for (const [role, active] of this.roles) {
      if (active.clip.id === id) {
        const release = this.startReleaseRole(role);
        if (release) releases.push(release);
      }
    }
    for (const release of this.releases) {
      if (release.clipId === id && !releases.includes(release)) {
        releases.push(release);
      }
    }
    const completed = await this.awaitCleanup(
      releases,
      cleanup,
    );
    const currentClip = this.options.registry.get(id);
    const removed =
      currentClip !== null &&
      this.sameClipSource(currentClip, requestedClip) &&
      this.options.registry.remove(id);
    return removed && completed;
  }

  async deactivate() {
    this.assertOpen();
    const cleanup = this.options.performance?.begin("cleanup") ?? null;
    this.cancelPendingPresentation();
    this.hasPresented = false;
    for (const role of ["pgm", "prewarm", "overlap"] as const) {
      this.startReleaseRole(role);
    }
    return this.awaitCleanup([...this.releases], cleanup);
  }

  degradeForPressure(): PressureAction {
    this.assertOpen();
    const action = this.options.coordinator.degradeForPressure();
    if (action === "overlap-disabled") {
      this.startReleaseRole("overlap", true);
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
    this.cancelPendingPresentation();
    this.hasPresented = false;
    const cleanup = this.options.performance?.begin("cleanup") ?? null;
    for (const role of ["pgm", "prewarm", "overlap"] as const) {
      this.startReleaseRole(role);
    }
    this.disposePromise = this.awaitCleanup(
      [...this.releases],
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
    this.startReleaseRole(role);
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
      seekInFlight: false,
    });
    this.options.coordinator.activate(
      role,
      clip.id,
      generation,
      null,
    );
  }

  private promotePrewarmToPgm(clip: RegisteredClip) {
    const warmed = this.roles.get("prewarm");
    if (!warmed || !this.sameSource(warmed, clip)) {
      this.syncRole("pgm", clip);
      return;
    }
    this.startReleaseRole("pgm");
    this.roles.delete("prewarm");
    this.options.coordinator.deactivate("prewarm");
    warmed.generation = ++this.generation;
    warmed.lastSourceGeneration = null;
    warmed.lastDiscontinuityGeneration = null;
    warmed.seekInFlight = false;
    this.roles.set("pgm", warmed);
    this.options.coordinator.activate(
      "pgm",
      warmed.clip.id,
      warmed.generation,
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
      const release = Promise.resolve(
        this.options.videos.release(
          active.clip,
          active.video,
          signal,
        ),
      );
      if (!signal) {
        await release;
      } else {
        await Promise.race([
          release,
          new Promise<never>((_, reject) => {
            const abort = () =>
              reject(
                new DOMException(
                  "video-cleanup-aborted",
                  "AbortError",
                ),
              );
            if (signal.aborted) abort();
            else signal.addEventListener("abort", abort, { once: true });
          }),
        ]);
      }
    } finally {
      this.options.registry.releaseReference(active.clip);
    }
  }

  private startReleaseRole(
    role: PlaybackLaneRole,
    coordinatorAlreadyReleased = false,
  ) {
    const active = this.roles.get(role);
    if (!active) return null;
    const controller = new AbortController();
    const tracked = {} as TrackedRelease;
    tracked.clipId = active.clip.id;
    tracked.controller = controller;
    tracked.promise = this.releaseRole(
      role,
      controller.signal,
      coordinatorAlreadyReleased,
    )
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        this.releases.delete(tracked);
      });
    this.releases.add(tracked);
    return tracked;
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

  private sameClipSource(
    left: RegisteredClip,
    right: RegisteredClip,
  ) {
    return (
      left.id === right.id &&
      left.revision === right.revision &&
      left.url === right.url
    );
  }

  private sourceKey(clip: RegisteredClip | null) {
    return clip ? `${clip.id}:${clip.revision}:${clip.url}` : null;
  }

  private cancelPendingPresentation() {
    if (this.pendingPresentation?.settled === false) {
      this.options.performance?.fail(this.pendingPresentation);
    }
    this.pendingPresentation = null;
    this.pendingSourceKey = null;
    this.pendingLaneGeneration = null;
  }

  private recordDroppedFrame(transport: PlaybackTransportState) {
    if (
      transport.playing &&
      this.hasPresented &&
      this.pendingPresentation === null
    ) {
      this.options.performance?.recordFrame({ dropped: true });
    }
  }

  private async awaitCleanup(
    releases: TrackedRelease[],
    token:
      | ReturnType<PlaybackPerformanceTracker["begin"]>
      | null,
  ) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const timedOut = new Promise<false>((resolve) => {
      timeout = setTimeout(() => {
        for (const release of releases) {
          release.controller.abort();
        }
        resolve(false);
      }, Math.min(
        CLEANUP_TIMEOUT_MS,
        Math.max(0, this.options.cleanupTimeoutMs ?? CLEANUP_TIMEOUT_MS),
      ));
    });
    const released = Promise.all(
      releases.map((release) => release.promise),
    ).then((results) => results.every(Boolean));
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
