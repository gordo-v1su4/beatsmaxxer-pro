export type QaRendererBackend =
  | "none"
  | "webgl2"
  | "webgpu"
  | "webcodecs-webgl2"
  | "html-video-webgl2";
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
    pressureStage: number;
    pressureCount: number;
    lastPressureAction: string | null;
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
    mediaOwners: number;
    mediaOwnerRefs: number;
    /** @deprecated use mediaOwners */
    sharedVideos: number;
    /** @deprecated use mediaOwnerRefs */
    sharedVideoRefs: number;
    decodedFrames: number;
    activeDecoders: number;
    gpuTextures: number;
    gpuBuffers: number;
    objectUrls: number;
    videoElements: number;
  };
}

export interface QaMediaTelemetryUpdate {
  renderer?: Partial<QaTelemetrySnapshot["renderer"]>;
  decoder?: Partial<QaTelemetrySnapshot["decoder"]>;
  cache?: Partial<QaTelemetrySnapshot["cache"]>;
  playback?: Partial<QaTelemetrySnapshot["playback"]>;
  resources?: Partial<
    Pick<
      QaTelemetrySnapshot["resources"],
      | "decodedFrames"
      | "activeDecoders"
      | "gpuTextures"
      | "gpuBuffers"
      | "objectUrls"
      | "videoElements"
    >
  >;
}

export type QaOwnedResourceKey =
  | "gpuTextures"
  | "gpuBuffers";

export type QaOwnedResourceDelta = Partial<
  Record<QaOwnedResourceKey, number>
>;

export interface QaResourceRegistration {
  add(delta: QaOwnedResourceDelta): void;
  release(): void;
}

const FRAME_SAMPLE_LIMIT = 120;
const frameIntervals: number[] = [];
let lastFrameAt: number | null = null;
const ownedResources = new Map<symbol, Record<QaOwnedResourceKey, number>>();

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
    pressureStage: 0,
    pressureCount: 0,
    lastPressureAction: null,
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
    mediaOwners: 0,
    mediaOwnerRefs: 0,
    sharedVideos: 0,
    sharedVideoRefs: 0,
    decodedFrames: 0,
    activeDecoders: 0,
    gpuTextures: 0,
    gpuBuffers: 0,
    objectUrls: 0,
    videoElements: 0,
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

export function updateMediaOwnerResources(entries: number, refs: number) {
  snapshot.resources.mediaOwners = Math.max(0, entries);
  snapshot.resources.mediaOwnerRefs = Math.max(0, refs);
  snapshot.resources.sharedVideos = snapshot.resources.mediaOwners;
  snapshot.resources.sharedVideoRefs = snapshot.resources.mediaOwnerRefs;
}

/** @deprecated use updateMediaOwnerResources */
export function updateSharedVideoResources(entries: number, refs: number) {
  updateMediaOwnerResources(entries, refs);
}

export function updateMediaTelemetry(update: QaMediaTelemetryUpdate) {
  if (update.renderer) Object.assign(snapshot.renderer, update.renderer);
  if (update.decoder) Object.assign(snapshot.decoder, update.decoder);
  if (update.cache) Object.assign(snapshot.cache, update.cache);
  if (update.playback) Object.assign(snapshot.playback, update.playback);
  if (update.resources) Object.assign(snapshot.resources, update.resources);
}

export function registerQaResourceOwner(
  initial: QaOwnedResourceDelta = {},
): QaResourceRegistration {
  const token = Symbol("qa-resource-owner");
  ownedResources.set(token, {
    gpuTextures: 0,
    gpuBuffers: 0,
  });

  const add = (delta: QaOwnedResourceDelta) => {
    const owned = ownedResources.get(token);
    if (!owned) return;
    for (const key of Object.keys(delta) as QaOwnedResourceKey[]) {
      const value = delta[key];
      if (value === undefined || !Number.isFinite(value)) continue;
      owned[key] = Math.max(0, owned[key] + value);
    }
    refreshOwnedResourceTotals();
  };
  add(initial);

  return {
    add,
    release() {
      if (!ownedResources.delete(token)) return;
      refreshOwnedResourceTotals();
    },
  };
}

function refreshOwnedResourceTotals() {
  for (const key of [
    "gpuTextures",
    "gpuBuffers",
  ] as const) {
    snapshot.resources[key] = [...ownedResources.values()].reduce(
      (sum, resources) => sum + resources[key],
      0,
    );
  }
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
  ownedResources.clear();
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
  snapshot.resources.mediaOwners = 0;
  snapshot.resources.mediaOwnerRefs = 0;
  snapshot.resources.sharedVideos = 0;
  snapshot.resources.sharedVideoRefs = 0;
  snapshot.decoder.state = "unavailable";
  snapshot.decoder.queueSize = null;
  snapshot.cache.occupancy = null;
  snapshot.cache.capacity = null;
  snapshot.playback.path = "unavailable";
  snapshot.playback.fallbackReason = null;
  snapshot.playback.activeLanes = 0;
  snapshot.playback.pressureStage = 0;
  snapshot.playback.pressureCount = 0;
  snapshot.playback.lastPressureAction = null;
  snapshot.resources.decodedFrames = 0;
  snapshot.resources.activeDecoders = 0;
  snapshot.resources.gpuTextures = 0;
  snapshot.resources.gpuBuffers = 0;
  snapshot.resources.objectUrls = 0;
  snapshot.resources.videoElements = 0;
}
