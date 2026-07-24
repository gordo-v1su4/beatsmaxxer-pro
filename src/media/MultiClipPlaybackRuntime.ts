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
} from "./PlaybackCoordinator";
import type { DecodedFrameLike } from "./types";

export interface CompatibilityVideoAdapter<Video extends object> {
  acquire(clip: RegisteredClip): Video;
  release(clip: RegisteredClip, video: Video): void;
  ready(video: Video): boolean;
  currentTime(video: Video): number;
  normalizeTime?(video: Video, timeSeconds: number): number;
  seek(video: Video, timeSeconds: number): void;
  setPlaying(video: Video, playing: boolean): void;
}

interface ActiveRole<Video extends object> {
  clip: RegisteredClip;
  video: Video;
  generation: number;
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
  dispose(): void;
}

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
  private pendingClipId: string | null = null;
  private hasPresented = false;
  private disposed = false;

  constructor(
    private readonly options: {
      registry: ClipRegistry;
      coordinator: PlaybackCoordinator<Frame>;
      renderer: MultiClipRendererRuntime<Frame, Video>;
      videos: CompatibilityVideoAdapter<Video>;
      performance?: PlaybackPerformanceTracker;
    },
  ) {}

  select(
    selection: MultiClipRoleSelection,
    latencyKind: PlaybackLatencyKind = "coldSwitch",
  ) {
    this.assertOpen();
    const unique = {
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
    if (
      this.roles.get("pgm")?.clip.id === unique.pgm &&
      (this.roles.get("prewarm")?.clip.id ?? null) ===
        unique.prewarm &&
      (this.roles.get("overlap")?.clip.id ?? null) ===
        unique.overlap
    ) {
      return;
    }
    const wasPrewarmed =
      unique.pgm !== null &&
      this.roles.get("prewarm")?.clip.id === unique.pgm;
    if (
      this.pendingPresentation?.settled === false &&
      this.pendingClipId !== unique.pgm
    ) {
      this.options.performance?.fail(this.pendingPresentation);
      this.pendingPresentation = null;
      this.pendingClipId = null;
    }
    if (!this.pendingPresentation && unique.pgm !== null) {
      this.pendingPresentation = this.options.performance?.begin(
        wasPrewarmed ? "prewarmedSwitch" : latencyKind,
      ) ?? null;
      this.pendingClipId = unique.pgm;
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
    this.pendingClipId = pgm.clip.id;
    pgm.generation = ++this.generation;
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
    options: { late?: boolean } = {},
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
      if (!this.options.videos.ready(pgm.video)) {
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
      const tolerance = 1 / 30;
      if (
        !transport.playing &&
        Math.abs(currentTime - targetTime) > tolerance
      ) {
        this.options.videos.seek(pgm.video, targetTime);
      }
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
      this.pendingClipId = null;
    }
    return true;
  }

  removeClip(id: string) {
    this.assertOpen();
    const cleanup = this.options.performance?.begin("cleanup") ?? null;
    for (const [role, active] of this.roles) {
      if (active.clip.id === id) this.releaseRole(role);
    }
    const removed = this.options.registry.remove(id);
    if (cleanup) this.options.performance?.succeed(cleanup);
    return removed;
  }

  deactivate() {
    this.assertOpen();
    const cleanup = this.options.performance?.begin("cleanup") ?? null;
    this.pendingPresentation = null;
    this.pendingClipId = null;
    this.hasPresented = false;
    for (const role of ["pgm", "prewarm", "overlap"] as const) {
      this.releaseRole(role);
    }
    if (cleanup) this.options.performance?.succeed(cleanup);
  }

  snapshot() {
    return {
      roles: {
        pgm: this.roles.get("pgm")?.clip.id ?? null,
        prewarm: this.roles.get("prewarm")?.clip.id ?? null,
        overlap: this.roles.get("overlap")?.clip.id ?? null,
      },
      coordinator: this.options.coordinator.snapshot(),
      renderer: this.options.renderer.snapshot(),
      performance: this.options.performance?.snapshot() ?? null,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingPresentation = null;
    this.pendingClipId = null;
    this.hasPresented = false;
    for (const role of ["pgm", "prewarm", "overlap"] as const)
      this.releaseRole(role);
    this.options.renderer.dispose();
    this.options.coordinator.dispose();
  }

  private syncRole(role: PlaybackLaneRole, clipId: string | null) {
    const current = this.roles.get(role);
    if (current?.clip.id === clipId) return;
    this.releaseRole(role);
    if (clipId === null) return;
    const clip = this.options.registry.get(clipId);
    if (!clip) return;
    const generation = ++this.generation;
    const video = this.options.videos.acquire(clip);
    this.roles.set(role, { clip, video, generation });
    this.options.coordinator.activate(
      role,
      clip.id,
      generation,
      null,
    );
  }

  private releaseRole(role: PlaybackLaneRole) {
    const active = this.roles.get(role);
    if (!active) return;
    this.roles.delete(role);
    this.options.coordinator.deactivate(role);
    this.options.videos.release(active.clip, active.video);
  }

  private assertOpen() {
    if (this.disposed) throw new Error("multi-clip-runtime-disposed");
  }
}
