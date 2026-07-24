import {
  registerQaResourceOwner,
  updateMediaTelemetry,
  type QaOwnedResourceDelta,
  type QaResourceRegistration,
  type QaMediaTelemetryUpdate,
} from "../qa/telemetry";
import type {
  ClipDecoderState,
} from "./decoder/WebCodecsClipDecoder";
import type {
  FrameCacheMetrics,
} from "./FrameCache";
import type {
  PlaybackCoordinatorSnapshot,
  PlaybackCoordinatorOptions,
} from "./PlaybackCoordinator";
import { PlaybackCoordinator } from "./PlaybackCoordinator";
import type { DecodedFrameLike } from "./types";

export class QaMediaTelemetryBridge {
  decoder = (
    state: ClipDecoderState,
    queueSize: number | null,
  ) => {
    updateMediaTelemetry({
      decoder: { state, queueSize },
    });
  };

  cache = (metrics: FrameCacheMetrics) => {
    updateMediaTelemetry({
      cache: {
        occupancy: metrics.occupancy,
        capacity: metrics.capacity,
      },
      resources: {
        decodedFrames: metrics.occupancy,
      },
    });
  };

  coordinator = (snapshot: PlaybackCoordinatorSnapshot) => {
    const activeLanes = Object.values(snapshot.slots).filter(
      (slot) => slot !== null,
    ).length;
    updateMediaTelemetry({
      renderer: {
        backend:
          snapshot.fallback.path === "webcodecs-webgpu"
            ? "webgpu"
            : snapshot.fallback.path === "webcodecs-webgl2"
              ? "webcodecs-webgl2"
              : snapshot.fallback.path === "html-video-webgl2"
                ? "html-video-webgl2"
                : "none",
      },
      decoder: {
        queueSize: Math.max(
          0,
          ...Object.values(snapshot.slots).map(
            (slot) => slot?.decodeQueueSize ?? 0,
          ),
        ),
      },
      cache: {
        occupancy: snapshot.retainedFrames,
        capacity: 32,
      },
      playback: {
        path: snapshot.fallback.path,
        fallbackReason: snapshot.fallback.reason,
        activeLanes,
      },
      resources: {
        decodedFrames: snapshot.retainedFrames,
        activeDecoders: snapshot.activeDecoders,
      },
    });
  };

  resources(update: NonNullable<QaMediaTelemetryUpdate["resources"]>) {
    updateMediaTelemetry({ resources: update });
  }

  registerResources(
    initial: QaOwnedResourceDelta = {},
  ): QaResourceRegistration {
    return registerQaResourceOwner(initial);
  }
}

export function createQaInstrumentedPlaybackCoordinator<
  Frame extends DecodedFrameLike,
>(options: PlaybackCoordinatorOptions = {}) {
  const bridge = new QaMediaTelemetryBridge();
  const coordinator = new PlaybackCoordinator<Frame>({
    ...options,
    onTelemetry(snapshot) {
      bridge.coordinator(snapshot);
      options.onTelemetry?.(snapshot);
    },
  });
  bridge.coordinator(coordinator.snapshot());
  return coordinator;
}
