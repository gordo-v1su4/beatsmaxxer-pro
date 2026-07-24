import {
  FrameCache,
  type FrameIdentity,
  type FrameLease,
} from "./FrameCache";
import type {
  DecodedFrameLike,
  MediaFallback,
} from "./types";

export const PLAYBACK_LANE_ROLES = [
  "pgm",
  "prewarm",
  "overlap",
] as const;
export type PlaybackLaneRole = (typeof PLAYBACK_LANE_ROLES)[number];

export const MAX_FRAMES_PER_LANE = 12;
export const MAX_GLOBAL_FRAMES = 32;
export const MAX_DECODE_QUEUE_SIZE = 8;

export interface LaneDecoderResource {
  readonly decodeQueueSize: number;
  close(): void;
}

export interface PlaybackLane<Frame extends DecodedFrameLike> {
  readonly role: PlaybackLaneRole;
  readonly clipId: string;
  readonly generation: number;
  readonly cache: FrameCache<Frame>;
  decoder: LaneDecoderResource | null;
  decodeBatchActive: boolean;
}

export interface PlaybackTransportState {
  presentationTimeSeconds: number;
  playing: boolean;
  discontinuityGeneration: number;
}

export type PressureAction =
  | "inactive-cache-evicted"
  | "prewarm-frames-dropped"
  | "prewarm-decoder-closed"
  | "overlap-disabled"
  | "html-fallback-selected";

export interface PlaybackCoordinatorSnapshot {
  slots: Record<
    PlaybackLaneRole,
    {
      clipId: string;
      generation: number;
      retainedFrames: number;
      decoderOpen: boolean;
      decodeQueueSize: number;
    } | null
  >;
  retainedFrames: number;
  activeDecoders: number;
  overlapEnabled: boolean;
  fallback: MediaFallback;
  rendererResourceGeneration: number;
  transport: PlaybackTransportState;
}

export interface PlaybackCoordinatorOptions {
  onTelemetry?: (snapshot: PlaybackCoordinatorSnapshot) => void;
}

function isLaneRole(value: string): value is PlaybackLaneRole {
  return (PLAYBACK_LANE_ROLES as readonly string[]).includes(value);
}

export class PlaybackCoordinator<Frame extends DecodedFrameLike> {
  private readonly slots: Record<
    PlaybackLaneRole,
    PlaybackLane<Frame> | null
  > = {
    pgm: null,
    prewarm: null,
    overlap: null,
  };
  private readonly inactiveCaches = new Set<FrameCache<Frame>>();
  private pressureStage = 0;
  private disposed = false;
  private overlapEnabled = true;
  private rendererResourceGeneration = 0;
  private fallback: MediaFallback = {
    path: "webcodecs-webgpu",
    reason: null,
  };
  private transport: PlaybackTransportState = {
    presentationTimeSeconds: 0,
    playing: false,
    discontinuityGeneration: 0,
  };

  constructor(private readonly options: PlaybackCoordinatorOptions = {}) {}

  activate(
    role: PlaybackLaneRole,
    clipId: string,
    generation: number,
    decoder: LaneDecoderResource,
  ) {
    this.assertOpen();
    if (!isLaneRole(role)) throw new Error("fourth-playback-lane-prohibited");
    if (role === "overlap" && !this.overlapEnabled) {
      throw new Error("overlap-disabled");
    }
    if (clipId.length === 0) throw new Error("clip-id-required");
    if (!Number.isInteger(generation) || generation < 0) {
      throw new Error("invalid-lane-generation");
    }
    if (decoder.decodeQueueSize > MAX_DECODE_QUEUE_SIZE) {
      throw new Error("decode-queue-budget-exceeded");
    }
    this.releaseLane(this.slots[role]);
    this.slots[role] = {
      role,
      clipId,
      generation,
      cache: new FrameCache<Frame>(MAX_FRAMES_PER_LANE),
      decoder,
      decodeBatchActive: false,
    };
    this.enforceBudgets();
    this.report();
    return this.slots[role];
  }

  deactivate(role: PlaybackLaneRole) {
    this.assertRole(role);
    this.releaseLane(this.slots[role]);
    this.slots[role] = null;
    this.report();
  }

  getLane(role: PlaybackLaneRole) {
    this.assertRole(role);
    return this.slots[role];
  }

  insertFrame(
    role: PlaybackLaneRole,
    identity: FrameIdentity,
    frame: Frame,
    durationUs = frame.duration ?? 0,
  ) {
    const lane = this.requireLane(role);
    if (
      identity.clipId !== lane.clipId ||
      identity.generation !== lane.generation
    ) {
      frame.close();
      return false;
    }
    const inserted = lane.cache.insert(identity, frame, durationUs);
    this.enforceBudgets();
    this.report();
    return inserted;
  }

  leaseFrame(
    role: PlaybackLaneRole,
    timestampUs: number,
    owner: string,
  ) {
    const lane = this.requireLane(role);
    return lane.cache.acquireForTimestamp(
      lane.clipId,
      lane.generation,
      timestampUs,
      owner,
    );
  }

  leaseCrossfade(
    timestampUs: number,
    pgmOwner = "compositor-pgm",
    overlapOwner = "compositor-overlap",
  ): {
    pgm: FrameLease<Frame>;
    overlap: FrameLease<Frame>;
  } | null {
    const pgm = this.leaseFrame("pgm", timestampUs, pgmOwner);
    const overlap = this.leaseFrame(
      "overlap",
      timestampUs,
      overlapOwner,
    );
    if (!pgm || !overlap) {
      pgm?.release();
      overlap?.release();
      return null;
    }
    if (pgm.frame === overlap.frame) {
      pgm.release();
      overlap.release();
      throw new Error("crossfade-frame-alias");
    }
    return { pgm, overlap };
  }

  beginDecodeBatch(role: PlaybackLaneRole) {
    const lane = this.requireLane(role);
    if (lane.decodeBatchActive) {
      throw new Error("decode-batch-already-active");
    }
    lane.decodeBatchActive = true;
    let ended = false;
    this.report();
    return () => {
      if (ended) return;
      ended = true;
      lane.decodeBatchActive = false;
      this.report();
    };
  }

  retainInactiveCache(cache: FrameCache<Frame>) {
    this.assertOpen();
    this.inactiveCaches.add(cache);
  }

  updateTransport(transport: PlaybackTransportState) {
    this.transport = { ...transport };
    this.report();
  }

  handleRendererLoss(recovered: boolean) {
    this.assertOpen();
    if (recovered) {
      this.rendererResourceGeneration += 1;
    } else {
      this.fallback = {
        path: "html-video-webgl2",
        reason: "renderer-device-lost",
      };
    }
    this.report();
  }

  degradeForPressure(): PressureAction {
    this.assertOpen();
    const action: PressureAction =
      this.pressureStage === 0
        ? this.evictInactive()
        : this.pressureStage === 1
          ? this.dropPrewarmFrames()
          : this.pressureStage === 2
            ? this.closePrewarmDecoder()
            : this.pressureStage === 3
              ? this.disableOverlap()
              : this.selectPressureFallback();
    this.pressureStage = Math.min(4, this.pressureStage + 1);
    this.report();
    return action;
  }

  snapshot(): PlaybackCoordinatorSnapshot {
    const slot = (role: PlaybackLaneRole) => {
      const lane = this.slots[role];
      return lane
        ? {
            clipId: lane.clipId,
            generation: lane.generation,
            retainedFrames: lane.cache.size,
            decoderOpen: lane.decoder !== null,
            decodeQueueSize: lane.decoder?.decodeQueueSize ?? 0,
          }
        : null;
    };
    return {
      slots: {
        pgm: slot("pgm"),
        prewarm: slot("prewarm"),
        overlap: slot("overlap"),
      },
      retainedFrames: this.totalRetainedFrames(),
      activeDecoders: PLAYBACK_LANE_ROLES.filter(
        (role) => this.slots[role]?.decoder,
      ).length,
      overlapEnabled: this.overlapEnabled,
      fallback: { ...this.fallback },
      rendererResourceGeneration: this.rendererResourceGeneration,
      transport: { ...this.transport },
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const role of PLAYBACK_LANE_ROLES) {
      this.releaseLane(this.slots[role]);
      this.slots[role] = null;
    }
    for (const cache of this.inactiveCaches) cache.dispose();
    this.inactiveCaches.clear();
    this.report();
  }

  private enforceBudgets() {
    for (const role of PLAYBACK_LANE_ROLES) {
      const lane = this.slots[role];
      if (
        lane?.decoder &&
        lane.decoder.decodeQueueSize > MAX_DECODE_QUEUE_SIZE
      ) {
        throw new Error("decode-queue-budget-exceeded");
      }
    }
    let overflow = this.totalRetainedFrames() - MAX_GLOBAL_FRAMES;
    for (const role of ["prewarm", "overlap", "pgm"] as const) {
      if (overflow <= 0) break;
      overflow -= this.slots[role]?.cache.evictUnleased(overflow) ?? 0;
    }
    if (this.totalRetainedFrames() > MAX_GLOBAL_FRAMES) {
      throw new Error("global-frame-budget-exceeded");
    }
  }

  private totalRetainedFrames() {
    return PLAYBACK_LANE_ROLES.reduce(
      (total, role) => total + (this.slots[role]?.cache.size ?? 0),
      0,
    );
  }

  private evictInactive(): PressureAction {
    for (const cache of this.inactiveCaches) cache.dispose();
    this.inactiveCaches.clear();
    return "inactive-cache-evicted";
  }

  private dropPrewarmFrames(): PressureAction {
    this.slots.prewarm?.cache.clear();
    return "prewarm-frames-dropped";
  }

  private closePrewarmDecoder(): PressureAction {
    this.slots.prewarm?.decoder?.close();
    if (this.slots.prewarm) this.slots.prewarm.decoder = null;
    return "prewarm-decoder-closed";
  }

  private disableOverlap(): PressureAction {
    this.releaseLane(this.slots.overlap);
    this.slots.overlap = null;
    this.overlapEnabled = false;
    return "overlap-disabled";
  }

  private selectPressureFallback(): PressureAction {
    this.fallback = {
      path: "html-video-webgl2",
      reason: "decoded-frame-pressure",
    };
    return "html-fallback-selected";
  }

  private releaseLane(lane: PlaybackLane<Frame> | null) {
    if (!lane) return;
    lane.decoder?.close();
    lane.decoder = null;
    lane.cache.dispose();
    lane.decodeBatchActive = false;
  }

  private requireLane(role: PlaybackLaneRole) {
    this.assertRole(role);
    const lane = this.slots[role];
    if (!lane) throw new Error("playback-lane-inactive");
    return lane;
  }

  private assertRole(role: PlaybackLaneRole) {
    if (!isLaneRole(role)) throw new Error("fourth-playback-lane-prohibited");
  }

  private assertOpen() {
    if (this.disposed) throw new Error("playback-coordinator-disposed");
  }

  private report() {
    this.options.onTelemetry?.(this.snapshot());
  }
}
