export const STUDIO_CHUNK_MANIFEST_VERSION = "studio-chunk-manifest-v1";
export const STUDIO_CHUNK_SIZE_BYTES = 3 * 1024 * 1024;
/** Safe under Vercel Hobby incoming body limit; larger files use chunked staging. */
export const STUDIO_DIRECT_UPLOAD_MAX_BYTES = 4_000_000;

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

const STUDIO_CHUNK_UPLOAD_TIMEOUT_MS = 120_000;
const MEDIA_UPLOAD_PREFIX = "media-uploads";

function storageUploadUrl(uploadId: string, chunkIndex: number, filename: string, origin = window.location.origin) {
  const url = new URL("/__api/storage/upload", origin);
  url.searchParams.set("uploadId", uploadId);
  url.searchParams.set("chunkIndex", String(chunkIndex));
  url.searchParams.set("filename", filename);
  return url;
}

export function shouldUseChunkedStudioUpload(fileSize: number): boolean {
  return fileSize > STUDIO_DIRECT_UPLOAD_MAX_BYTES;
}

export function buildStudioChunkManifest(
  uploadId: string,
  file: File,
  chunks: StudioChunkManifestPart[],
): StudioChunkManifest {
  return {
    schema_version: STUDIO_CHUNK_MANIFEST_VERSION,
    upload_id: uploadId,
    filename: file.name,
    content_type: "audio/mpeg",
    total_bytes: file.size,
    chunks,
  };
}

export async function uploadStudioChunks(
  file: File,
  options: {
    onProgress?: (uploadedChunks: number, totalChunks: number) => void;
  } = {},
): Promise<StudioChunkManifest> {
  const uploadId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / STUDIO_CHUNK_SIZE_BYTES);
  const manifestChunks: StudioChunkManifestPart[] = [];

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * STUDIO_CHUNK_SIZE_BYTES;
    const end = Math.min(start + STUDIO_CHUNK_SIZE_BYTES, file.size);
    const chunkBlob = file.slice(start, end);
    const partName = `${String(index).padStart(5, "0")}.part`;
    const objectKey = `${MEDIA_UPLOAD_PREFIX}/source-audio/chunks/${uploadId}/${partName}`;

    const formData = new FormData();
    formData.set("file", chunkBlob, partName);

    const response = await fetch(storageUploadUrl(uploadId, index, file.name).toString(), {
      method: "POST",
      body: formData,
      cache: "no-store",
      signal: AbortSignal.timeout(STUDIO_CHUNK_UPLOAD_TIMEOUT_MS),
    });

    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const detail = typeof payload?.detail === "string"
        ? payload.detail
        : `Chunk upload failed with HTTP ${response.status}.`;
      throw new Error(detail);
    }

    const returnedKey = typeof payload?.object_key === "string" ? payload.object_key : objectKey;
    const size = typeof payload?.size === "number" ? payload.size : chunkBlob.size;
    manifestChunks.push({ index, object_key: returnedKey, size });
    options.onProgress?.(index + 1, totalChunks);
  }

  return buildStudioChunkManifest(uploadId, file, manifestChunks);
}
