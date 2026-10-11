import {
  fetchGatewayObject,
  mediaGatewayConfigFromEnv,
  type MediaGatewayConfig,
  studioChunkFolder,
} from "./mediaGateway.js";

export const STUDIO_CHUNK_MANIFEST_VERSION = "studio-chunk-manifest-v1";
export const STUDIO_CHUNK_SIZE_BYTES = 3 * 1024 * 1024;
/** Safe under Vercel Hobby incoming body limit (~4.5 MiB). */
export const STUDIO_DIRECT_UPLOAD_MAX_BYTES = 4_000_000;
export const STUDIO_MANIFEST_MAX_BYTES = 65_536;

export interface StudioChunkManifestPart {
  index: number;
  object_key: string;
  size: number;
}

export interface StudioChunkManifest {
  schema_version: typeof STUDIO_CHUNK_MANIFEST_VERSION;
  upload_id: string;
  filename: string;
  content_type: "audio/mpeg";
  total_bytes: number;
  chunks: StudioChunkManifestPart[];
}

const UPLOAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isStudioMp3Filename(filename: string): boolean {
  const name = filename.trim().toLowerCase();
  return name.endsWith(".mp3");
}

export function parseStudioChunkManifest(payload: unknown): StudioChunkManifest | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.schema_version !== STUDIO_CHUNK_MANIFEST_VERSION) return null;
  if (typeof record.upload_id !== "string" || !UPLOAD_ID_RE.test(record.upload_id)) return null;
  if (typeof record.filename !== "string" || !isStudioMp3Filename(record.filename)) return null;
  if (record.content_type !== "audio/mpeg") return null;
  if (typeof record.total_bytes !== "number" || !Number.isSafeInteger(record.total_bytes) || record.total_bytes <= 0) {
    return null;
  }
  if (!Array.isArray(record.chunks) || record.chunks.length === 0) return null;

  const chunks: StudioChunkManifestPart[] = [];
  for (const part of record.chunks) {
    if (!part || typeof part !== "object") return null;
    const chunk = part as Record<string, unknown>;
    if (typeof chunk.index !== "number" || !Number.isSafeInteger(chunk.index) || chunk.index < 0) return null;
    if (typeof chunk.object_key !== "string" || !chunk.object_key.trim()) return null;
    if (typeof chunk.size !== "number" || !Number.isSafeInteger(chunk.size) || chunk.size <= 0) return null;
    chunks.push({
      index: chunk.index,
      object_key: chunk.object_key.trim(),
      size: chunk.size,
    });
  }

  chunks.sort((a, b) => a.index - b.index);
  for (let i = 0; i < chunks.length; i += 1) {
    if (chunks[i].index !== i) return null;
  }

  const totalChunkBytes = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  if (totalChunkBytes !== record.total_bytes) return null;

  return {
    schema_version: STUDIO_CHUNK_MANIFEST_VERSION,
    upload_id: record.upload_id,
    filename: record.filename.trim(),
    content_type: "audio/mpeg",
    total_bytes: record.total_bytes,
    chunks,
  };
}

export function validateStudioChunkManifest(
  manifest: StudioChunkManifest,
  config: Pick<MediaGatewayConfig, "bucket" | "uploadPrefix">,
  maxTotalBytes: number,
): string | null {
  if (manifest.total_bytes > maxTotalBytes) {
    return "upload_too_large";
  }
  const expectedPrefix = `${studioChunkFolder(config.uploadPrefix, manifest.upload_id)}/`;
  for (const chunk of manifest.chunks) {
    if (!chunk.object_key.startsWith(expectedPrefix)) {
      return "invalid_manifest";
    }
    if (!chunk.object_key.endsWith(".part")) {
      return "invalid_manifest";
    }
    if (chunk.object_key.includes("..")) {
      return "invalid_manifest";
    }
  }
  return null;
}

export async function reassembleStudioChunks(
  manifest: StudioChunkManifest,
  gateway: MediaGatewayConfig,
  options: { fetch?: typeof globalThis.fetch } = {},
): Promise<Uint8Array> {
  const result = new Uint8Array(manifest.total_bytes);
  let offset = 0;
  for (const chunk of manifest.chunks) {
    const bytes = await fetchGatewayObject(gateway, chunk.object_key, options);
    if (bytes.byteLength !== chunk.size) {
      throw new Error(`Chunk ${chunk.index} size mismatch.`);
    }
    result.set(bytes, offset);
    offset += bytes.byteLength;
  }
  if (offset !== manifest.total_bytes) {
    throw new Error("Reassembled upload size mismatch.");
  }
  return result;
}

export function buildStudioMultipartBody(
  filename: string,
  mp3Bytes: Uint8Array,
  boundary = `studio-${crypto.randomUUID()}`,
): { contentType: string; body: Uint8Array } {
  const encoder = new TextEncoder();
  const preamble = encoder.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename.replace(/"/g, "")}"\r\n` +
    `Content-Type: audio/mpeg\r\n\r\n`,
  );
  const closing = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(preamble.byteLength + mp3Bytes.byteLength + closing.byteLength);
  body.set(preamble, 0);
  body.set(mp3Bytes, preamble.byteLength);
  body.set(closing, preamble.byteLength + mp3Bytes.byteLength);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body,
  };
}

export function mediaGatewayFromAnalysisEnv(
  env: Record<string, string | undefined>,
): MediaGatewayConfig {
  return mediaGatewayConfigFromEnv(env);
}
