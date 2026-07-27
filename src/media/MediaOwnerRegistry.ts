import { updateMediaOwnerResources } from "../qa/telemetry";

export type MediaOwnerKind = "preview" | "pgm" | "prewarm" | "overlap";

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
    video.play().catch(() => {});
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
