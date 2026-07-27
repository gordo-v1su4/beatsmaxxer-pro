import { beforeEach, describe, expect, test } from "bun:test";
import {
  MediaOwnerRegistry,
  mediaOwnerId,
} from "../../../src/media/MediaOwnerRegistry";
import { resetEffectSchedulesForTests } from "../../../src/media/EffectSchedule";

class FakeVideoElement {
  currentTime = 0;
  paused = true;
  playbackRate = 1;
  src = "";
  muted = false;
  loop = false;
  crossOrigin: string | null = null;
  preload = "";
  readyState = 0;
  duration = 10;
  videoWidth = 1920;
  videoHeight = 1080;
  networkState = 0;
  private listeners = new Map<string, Set<() => void>>();

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  load() {}

  removeAttribute() {}

  addEventListener(event: string, handler: () => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  removeEventListener(event: string, handler: () => void) {
    this.listeners.get(event)?.delete(handler);
  }

  cancelVideoFrameCallback() {}
  requestVideoFrameCallback() {
    return 0;
  }
}

function installFakeVideoDocument() {
  const original = globalThis.document;
  (globalThis as { document?: Document }).document = {
    createElement(tag: string) {
      if (tag === "video") return new FakeVideoElement() as unknown as HTMLVideoElement;
      throw new Error(`unsupported tag ${tag}`);
    },
  } as unknown as Document;
  return () => {
    if (original) {
      globalThis.document = original;
    } else {
      delete (globalThis as { document?: Document }).document;
    }
  };
}

describe("media owner isolation", () => {
  beforeEach(() => {
    resetEffectSchedulesForTests();
  });

  test("preview and pgm owners get distinct video elements for the same url", () => {
    const restore = installFakeVideoDocument();
    const registry = new MediaOwnerRegistry();
    const url = "/fixtures/shared.mp4";
    const previewId = mediaOwnerId("preview", "timesampler");
    const pgmId = mediaOwnerId("pgm", "timesampler");

    const previewVideo = registry.acquireHtmlVideo(previewId, url);
    const pgmVideo = registry.acquireHtmlVideo(pgmId, url);

    expect(previewVideo).not.toBe(pgmVideo);
    expect(registry.ownerCount()).toBe(2);
    expect(registry.hasOwner(previewId)).toBe(true);
    expect(registry.hasOwner(pgmId)).toBe(true);

    previewVideo.currentTime = 3.5;
    previewVideo.paused = false;
    registry.bumpGeneration(previewId);

    expect(pgmVideo.currentTime).toBe(0);
    expect(registry.getGeneration(previewId)).toBe(1);
    expect(registry.getGeneration(pgmId)).toBe(0);

    registry.release(previewId, url);
    registry.release(pgmId, url);
    expect(registry.ownerCount()).toBe(0);
    restore();
  });

  test("ref counting keeps owner alive until final release", () => {
    const restore = installFakeVideoDocument();
    const registry = new MediaOwnerRegistry();
    const ownerId = mediaOwnerId("preview", "tapdelay");
    const url = "/fixtures/a.mp4";

    const first = registry.acquireHtmlVideo(ownerId, url);
    const second = registry.acquireHtmlVideo(ownerId, url);
    expect(first).toBe(second);
    expect(registry.ownerCount()).toBe(1);

    registry.release(ownerId, url);
    expect(registry.hasOwner(ownerId)).toBe(true);
    registry.release(ownerId, url);
    expect(registry.hasOwner(ownerId)).toBe(false);
    restore();
  });
});
