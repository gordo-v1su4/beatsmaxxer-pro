import { describe, expect, it, vi } from "vitest";
import {
  buildStudioMultipartBody,
  parseStudioChunkManifest,
  STUDIO_CHUNK_MANIFEST_VERSION,
  validateStudioChunkManifest,
  type StudioChunkManifest,
} from "../../../../api/lib/studioChunkManifest";

const gateway = {
  bucket: "beatsmaxxer-pro",
  uploadPrefix: "media-uploads",
};

function sampleManifest(uploadId = "11111111-1111-4111-8111-111111111111"): StudioChunkManifest {
  const prefix = `media-uploads/source-audio/chunks/${uploadId}`;
  return {
    schema_version: STUDIO_CHUNK_MANIFEST_VERSION,
    upload_id: uploadId,
    filename: "track.mp3",
    content_type: "audio/mpeg" as const,
    total_bytes: 6,
    chunks: [
      { index: 0, object_key: `${prefix}/00000.part`, size: 3 },
      { index: 1, object_key: `${prefix}/00001.part`, size: 3 },
    ],
  };
}

describe("studio chunk manifest", () => {
  it("parses a valid manifest", () => {
    const manifest = sampleManifest();
    expect(parseStudioChunkManifest(manifest)).toEqual(manifest);
  });

  it("rejects non-contiguous chunk indexes", () => {
    const manifest = sampleManifest();
    manifest.chunks[1].index = 2;
    expect(parseStudioChunkManifest(manifest)).toBeNull();
  });

  it("rejects size totals that do not match chunk bytes", () => {
    const manifest = sampleManifest();
    manifest.total_bytes = 7;
    expect(parseStudioChunkManifest(manifest)).toBeNull();
  });

  it("rejects object keys outside the upload prefix", () => {
    const manifest = sampleManifest();
    expect(validateStudioChunkManifest(manifest, gateway, 12_000_000)).toBeNull();
    manifest.chunks[0].object_key = "media-uploads/other/00000.part";
    expect(validateStudioChunkManifest(manifest, gateway, 12_000_000)).toBe("invalid_manifest");
  });

  it("rejects uploads above the hosted analysis limit", () => {
    const manifest = sampleManifest();
    manifest.total_bytes = 13_000_000;
    manifest.chunks = [{ index: 0, object_key: `media-uploads/source-audio/chunks/${manifest.upload_id}/00000.part`, size: 13_000_000 }];
    expect(validateStudioChunkManifest(manifest, gateway, 12_000_000)).toBe("upload_too_large");
  });

  it("builds multipart bodies for upstream studio submission", () => {
    const mp3 = new Uint8Array([1, 2, 3, 4]);
    const multipart = buildStudioMultipartBody("song.mp3", mp3, "test-boundary");
    expect(multipart.contentType).toBe("multipart/form-data; boundary=test-boundary");
    const text = new TextDecoder().decode(multipart.body.slice(0, 120));
    expect(text).toContain('filename="song.mp3"');
    expect(text).toContain("Content-Type: audio/mpeg");
  });
});
