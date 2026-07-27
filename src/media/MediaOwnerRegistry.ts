import { updateMediaOwnerResources } from "../qa/telemetry";

/**
 * "clip" is the shared decode lane: preview and PGM consumers of the same clip
 * hold refs on one element instead of decoding the file twice. The role-specific
 * kinds remain for callers that genuinely need an independent element.
 */
export type MediaOwnerKind =
  | "clip"
  | "preview"
  | "pgm"
  | "prewarm"
  | "overlap";

export type MediaOwnerId = `${MediaOwnerKind}:${string}`;

export function mediaOwnerId(
  kind: MediaOwnerKind,
  moduleId: string,
): MediaOwnerId {
  return `${kind}:${moduleId}`;
}

interface HtmlVideoOwnerEntry {
  ownerId: MediaOwnerId;
  url: string;
  video: HTMLVideoElement;
  refs: number;
  generation: number;
}

/**
 * Spacing between decoder starts. Bringing every lane up in the same tick makes
 * the clips contend for the connection pool and the decoder, which shows up as
 * dropped frames across all of them rather than a slower ramp on one.
 */
const DECODER_START_STAGGER_MS = 250;

let nextDecoderStartAt = 0;

function createVideoElement(url: string) {
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  return video;
}

function startStaggered(video: HTMLVideoElement) {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const startAt = Math.max(now, nextDecoderStartAt);
  nextDecoderStartAt = startAt + DECODER_START_STAGGER_MS;
  const delay = startAt - now;
  if (delay <= 0) {
    video.play().catch(() => {});
    return;
  }
  setTimeout(() => {
    // The owner may have been released before its slot came up.
    if (!video.isConnected && video.src === "") return;
    video.play().catch(() => {});
  }, delay);
}

function refreshTelemetry(
  owners: Map<MediaOwnerId, HtmlVideoOwnerEntry>,
) {
  const entries = [...owners.values()];
  updateMediaOwnerResources(
    entries.length,
    entries.reduce((total, entry) => total + entry.refs, 0),
  );
}

export class MediaOwnerRegistry {
  private readonly owners = new Map<MediaOwnerId, HtmlVideoOwnerEntry>();

  acquireHtmlVideo(ownerId: MediaOwnerId, url: string) {
    const existing = this.owners.get(ownerId);
    if (existing) {
      if (existing.url !== url) {
        this.destroyOwner(ownerId);
      } else {
        existing.refs += 1;
        refreshTelemetry(this.owners);
        return existing.video;
      }
    }

    const video = createVideoElement(url);
    startStaggered(video);
    this.owners.set(ownerId, {
      ownerId,
      url,
      video,
      refs: 1,
      generation: 0,
    });
    refreshTelemetry(this.owners);
    return video;
  }

  getVideo(ownerId: MediaOwnerId) {
    return this.owners.get(ownerId)?.video ?? null;
  }

  getGeneration(ownerId: MediaOwnerId) {
    return this.owners.get(ownerId)?.generation ?? 0;
  }

  bumpGeneration(ownerId: MediaOwnerId) {
    const entry = this.owners.get(ownerId);
    if (!entry) return 0;
    entry.generation += 1;
    return entry.generation;
  }

  release(ownerId: MediaOwnerId, url: string) {
    const entry = this.owners.get(ownerId);
    if (!entry || entry.url !== url) return;
    entry.refs -= 1;
    if (entry.refs <= 0) {
      this.destroyOwner(ownerId);
    } else {
      refreshTelemetry(this.owners);
    }
  }

  async releaseAsync(
    ownerId: MediaOwnerId,
    url: string,
    signal?: AbortSignal,
  ) {
    const entry = this.owners.get(ownerId);
    if (!entry || entry.url !== url) return;
    entry.refs -= 1;
    if (entry.refs > 0) {
      refreshTelemetry(this.owners);
      return;
    }

    const video = entry.video;
    this.owners.delete(ownerId);
    refreshTelemetry(this.owners);

    const emptied = new Promise<void>((resolve, reject) => {
      const finish = () => {
        video.removeEventListener("emptied", finish);
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        video.removeEventListener("emptied", finish);
        reject(new DOMException("video-cleanup-aborted", "AbortError"));
      };
      video.addEventListener("emptied", finish, { once: true });
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      queueMicrotask(() => {
        if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
          finish();
        }
      });
    });
    video.pause();
    video.removeAttribute("src");
    video.load();
    return emptied;
  }

  ownerCount() {
    return this.owners.size;
  }

  decodeStats() {
    return [...this.owners.values()].map((entry) => {
      const quality = entry.video.getVideoPlaybackQuality?.();
      return {
        ownerId: entry.ownerId,
        readyState: entry.video.readyState,
        paused: entry.video.paused,
        currentTime: entry.video.currentTime,
        width: entry.video.videoWidth,
        height: entry.video.videoHeight,
        refs: entry.refs,
        totalFrames: quality?.totalVideoFrames ?? null,
        droppedFrames: quality?.droppedVideoFrames ?? null,
      };
    });
  }

  hasOwner(ownerId: MediaOwnerId) {
    return this.owners.has(ownerId);
  }

  transferHtmlVideo(
    fromOwnerId: MediaOwnerId,
    toOwnerId: MediaOwnerId,
    url: string,
  ) {
    const entry = this.owners.get(fromOwnerId);
    if (!entry || entry.url !== url) return null;
    // Shared-lane owners resolve every role to the same id; moving it onto
    // itself would double the ref count and then destroy the live element.
    if (fromOwnerId === toOwnerId) return entry.video;
    const existingTarget = this.owners.get(toOwnerId);
    if (existingTarget && existingTarget.url !== url) {
      this.destroyOwner(toOwnerId);
    } else if (existingTarget) {
      existingTarget.refs += entry.refs;
      this.destroyOwner(fromOwnerId);
      refreshTelemetry(this.owners);
      return existingTarget.video;
    }
    this.owners.delete(fromOwnerId);
    this.owners.set(toOwnerId, {
      ...entry,
      ownerId: toOwnerId,
    });
    refreshTelemetry(this.owners);
    return entry.video;
  }

  private destroyOwner(ownerId: MediaOwnerId) {
    const entry = this.owners.get(ownerId);
    if (!entry) return;
    entry.video.pause();
    entry.video.removeAttribute("src");
    entry.video.load();
    this.owners.delete(ownerId);
    refreshTelemetry(this.owners);
  }

  dispose() {
    for (const ownerId of [...this.owners.keys()]) {
      this.destroyOwner(ownerId);
    }
  }
}

export const mediaOwnerRegistry = new MediaOwnerRegistry();
