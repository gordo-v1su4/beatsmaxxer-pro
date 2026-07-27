import { beforeEach, describe, expect, test } from "bun:test";
import {
  MediaOwnerRegistry,
  mediaOwnerId,
} from "../../../src/media/MediaOwnerRegistry";
import { DecodeScheduler } from "../../../src/media/DecodeScheduler";
import { PlaybackCoordinator } from "../../../src/media/PlaybackCoordinator";
import { Mp4DemuxBoundary } from "../../../src/media/demux/mp4";
import { mediaTrackFixture } from "../../unit/media/fakes";

describe("DecodeScheduler", () => {
  test("loads clip assets through injected demux boundary", async () => {
    const coordinator = new PlaybackCoordinator<VideoFrame>();
    const demux = new Mp4DemuxBoundary({
      id: "test",
      async demux() {
        return mediaTrackFixture();
      },
    });
    const scheduler = new DecodeScheduler(coordinator, demux);
    const clip = {
      id: "clip-a",
      name: "Clip A",
      url: "http://127.0.0.1/fixtures/clip-a.mp4",
      objectUrlOwned: false,
      revision: 1,
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as Response;

    try {
      const asset = await scheduler.loadClip(clip);
      expect(asset.id).toBe("clip-a");
      expect(asset.samples.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
      scheduler.dispose();
      coordinator.dispose();
    }
  });
});

describe("media owner registry transfer", () => {
  beforeEach(() => {});

  test("transfers html video ownership between roles", () => {
    const restore = installFakeVideoDocument();
    const registry = new MediaOwnerRegistry();
    const url = "/shared.mp4";
    const preview = registry.acquireHtmlVideo(
      mediaOwnerId("prewarm", "clip-0"),
      url,
    );
    registry.transferHtmlVideo(
      mediaOwnerId("prewarm", "clip-0"),
      mediaOwnerId("pgm", "clip-0"),
      url,
    );
    expect(registry.getVideo(mediaOwnerId("pgm", "clip-0"))).toBe(preview);
    expect(registry.hasOwner(mediaOwnerId("prewarm", "clip-0"))).toBe(false);
    registry.release(mediaOwnerId("pgm", "clip-0"), url);
    restore();
  });
});

class FakeVideoElement {
  currentTime = 0;
  paused = true;
  src = "";
  muted = false;
  loop = false;
  crossOrigin: string | null = null;
  preload = "";
  readyState = 0;
  duration = 10;
  networkState = 0;
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
  removeAttribute() {}
  addEventListener() {}
  removeEventListener() {}
}

function installFakeVideoDocument() {
  const original = globalThis.document;
  (globalThis as { document?: Document }).document = {
    createElement(tag: string) {
      if (tag === "video") {
        return new FakeVideoElement() as unknown as HTMLVideoElement;
      }
      throw new Error(`unsupported tag ${tag}`);
    },
  } as unknown as Document;
  return () => {
    if (original) globalThis.document = original;
  };
}
