export type QaRendererBackend = "none" | "webgl2";
export type QaDecoderState =
  | "unavailable"
  | "idle"
  | "configured"
  | "decoding"
  | "closed"
  | "error";
export type QaPlaybackPath =
  | "unavailable"
  | "webcodecs-webgpu"
  | "webcodecs-webgl2"
  | "html-video-webgl2"
  | "native-static";

export interface QaTelemetrySnapshot {
  renderer: {
    backend: QaRendererBackend;
    active: number;
  };
  decoder: {
    state: QaDecoderState;
    queueSize: number | null;
  };
  cache: {
    occupancy: number | null;
    capacity: number | null;
  };
  playback: {
    path: QaPlaybackPath;
    fallbackReason: string | null;
    activeLanes: number;
  };
  frames: {
    rendered: number;
    lastIntervalMs: number | null;
    averageIntervalMs: number | null;
    maxIntervalMs: number | null;
  };
  resources: {
    renderers: number;
    renderTargets: number;
    sharedVideos: number;
    sharedVideoRefs: number;
    decodedFrames: number;
    activeDecoders: number;
  };
}

export interface QaMediaTelemetryUpdate {
  decoder?: Partial<QaTelemetrySnapshot["decoder"]>;
  cache?: Partial<QaTelemetrySnapshot["cache"]>;
  playback?: Partial<QaTelemetrySnapshot["playback"]>;
  resources?: Partial<
    Pick<
      QaTelemetrySnapshot["resources"],
      "decodedFrames" | "activeDecoders"
    >
  >;
}

const FRAME_SAMPLE_LIMIT = 120;
const frameIntervals: number[] = [];
let lastFrameAt: number | null = null;

const snapshot: QaTelemetrySnapshot = {
  renderer: {
    backend: "none",
    active: 0,
  },
  decoder: {
    state: "unavailable",
    queueSize: null,
  },
  cache: {
    occupancy: null,
    capacity: null,
  },
  playback: {
    path: "unavailable",
    fallbackReason: null,
    activeLanes: 0,
  },
  frames: {
    rendered: 0,
    lastIntervalMs: null,
    averageIntervalMs: null,
    maxIntervalMs: null,
  },
  resources: {
    renderers: 0,
    renderTargets: 0,
    sharedVideos: 0,
    sharedVideoRefs: 0,
    decodedFrames: 0,
    activeDecoders: 0,
  },
};

export function registerWebGlRenderer(renderTargetCount: number) {
  snapshot.renderer.active += 1;
  snapshot.renderer.backend = "webgl2";
  snapshot.resources.renderers += 1;
  snapshot.resources.renderTargets += renderTargetCount;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    snapshot.renderer.active = Math.max(0, snapshot.renderer.active - 1);
    snapshot.resources.renderers = Math.max(0, snapshot.resources.renderers - 1);
    snapshot.resources.renderTargets = Math.max(
      0,
      snapshot.resources.renderTargets - renderTargetCount,
    );
    if (snapshot.renderer.active === 0) snapshot.renderer.backend = "none";
  };
}

export function updateSharedVideoResources(entries: number, refs: number) {
  snapshot.resources.sharedVideos = Math.max(0, entries);
  snapshot.resources.sharedVideoRefs = Math.max(0, refs);
}

export function updateMediaTelemetry(update: QaMediaTelemetryUpdate) {
  if (update.decoder) Object.assign(snapshot.decoder, update.decoder);
  if (update.cache) Object.assign(snapshot.cache, update.cache);
  if (update.playback) Object.assign(snapshot.playback, update.playback);
  if (update.resources) Object.assign(snapshot.resources, update.resources);
}

export function recordRenderedFrame(frameAt: number) {
  snapshot.frames.rendered += 1;
  if (lastFrameAt !== null) {
    const interval = Math.max(0, frameAt - lastFrameAt);
    frameIntervals.push(interval);
    if (frameIntervals.length > FRAME_SAMPLE_LIMIT) frameIntervals.shift();
    snapshot.frames.lastIntervalMs = interval;
    snapshot.frames.averageIntervalMs =
      frameIntervals.reduce((sum, value) => sum + value, 0) / frameIntervals.length;
    snapshot.frames.maxIntervalMs = Math.max(...frameIntervals);
  }
  lastFrameAt = frameAt;
}

export function getQaTelemetrySnapshot(): QaTelemetrySnapshot {
  return structuredClone(snapshot);
}

export function resetQaTelemetryForTests() {
  frameIntervals.length = 0;
  lastFrameAt = null;
  snapshot.renderer.backend = "none";
  snapshot.renderer.active = 0;
  snapshot.frames.rendered = 0;
  snapshot.frames.lastIntervalMs = null;
  snapshot.frames.averageIntervalMs = null;
  snapshot.frames.maxIntervalMs = null;
  snapshot.resources.renderers = 0;
  snapshot.resources.renderTargets = 0;
  snapshot.resources.sharedVideos = 0;
  snapshot.resources.sharedVideoRefs = 0;
  snapshot.decoder.state = "unavailable";
  snapshot.decoder.queueSize = null;
  snapshot.cache.occupancy = null;
  snapshot.cache.capacity = null;
  snapshot.playback.path = "unavailable";
  snapshot.playback.fallbackReason = null;
  snapshot.playback.activeLanes = 0;
  snapshot.resources.decodedFrames = 0;
  snapshot.resources.activeDecoders = 0;
}
