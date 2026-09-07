import {
  accessGateConfigFromEnv,
  isAccessGateEnabled,
  isValidSessionToken,
  parseCookie,
  ACCESS_COOKIE_NAME,
  type AccessGateConfig,
} from "../gate/policy.js";
import {
  isMediaGatewayConfigured,
  mediaGatewayConfigFromEnv,
  studioChunkObjectKey,
  uploadToMediaGateway,
  type MediaGatewayConfig,
} from "../lib/mediaGateway.js";
import { isTrustedSameOriginRequest } from "../analyze/policy.js";

export const STORAGE_CHUNK_MAX_BYTES = 3 * 1024 * 1024 + 512_000;

export interface StorageUploadRequest {
  method?: string;
  contentType?: string;
  contentLength?: string;
  origin?: string;
  host?: string;
  forwardedProto?: string;
  fetchSite?: string;
  cookieHeader?: string;
  uploadId?: string;
  chunkIndex?: string;
  filename?: string;
  body: AsyncIterable<Uint8Array>;
  signal?: AbortSignal;
}

export interface StorageUploadResponse {
  status: number;
  contentType: "application/json";
  body: string;
}

export interface StorageUploadOptions {
  fetch?: typeof globalThis.fetch;
  maxChunkBytes?: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  access_locked: "This deployment is locked. Enter the access code to use hosted analysis.",
  storage_unavailable: "Chunk upload staging is unavailable.",
  cross_origin_forbidden: "Chunk uploads must come from this application.",
  invalid_content_type: "Chunk uploads must use multipart/form-data with a valid boundary.",
  upload_too_large: "Chunk upload exceeds the allowed request size.",
  invalid_request: "Chunk upload request is invalid.",
  request_body_unavailable: "The chunk upload could not be read by the server.",
};

const UPLOAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function storageGatewayConfigFromEnv(env: Record<string, string | undefined>) {
  return mediaGatewayConfigFromEnv(env);
}

export function isStorageUploadConfigured(config: MediaGatewayConfig) {
  return isMediaGatewayConfigured(config);
}

function isRequestUnlocked(request: StorageUploadRequest, gate: AccessGateConfig) {
  if (!isAccessGateEnabled(gate)) return true;
  return isValidSessionToken(parseCookie(request.cookieHeader, ACCESS_COOKIE_NAME), gate);
}

function jsonError(status: number, code: string, message = ERROR_MESSAGES[code] ?? "Chunk upload failed.") {
  return { status, contentType: "application/json" as const, body: JSON.stringify({ code, detail: message }) };
}

function parseMultipartContentType(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^\s;]+))\s*$/i);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary || boundary.length > 70) return null;
  return /^[0-9A-Za-z'()+_,\-.\/:=? ]*[0-9A-Za-z'()+_,\-.\/:=?]$/.test(boundary) ? boundary : null;
}

class LimitExceededError extends Error {}

async function readBoundedBody(
  body: AsyncIterable<Uint8Array>,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const iterator = body[Symbol.asyncIterator]();
  while (true) {
    const next = await iterator.next();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > limit) throw new LimitExceededError();
    chunks.push(next.value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function parseContentLength(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseChunkIndex(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed < 10_000 ? parsed : null;
}

function extractMultipartFile(
  body: Uint8Array,
  boundary: string,
): { filename: string; contentType: string; data: Uint8Array } | null {
  const text = new TextDecoder("latin1").decode(body);
  const marker = `--${boundary}`;
  if (!text.startsWith(marker)) return null;

  const fileHeaderRe = /Content-Disposition:\s*form-data;\s*name="file"(?:;\s*filename="([^"]*)")?/i;
  const match = fileHeaderRe.exec(text);
  if (!match) return null;

  const headerEnd = text.indexOf("\r\n\r\n");
  if (headerEnd < 0) return null;
  const dataStart = headerEnd + 4;
  const closing = `\r\n--${boundary}`;
  const dataEnd = text.lastIndexOf(closing);
  if (dataEnd < dataStart) return null;

  const filename = match[1]?.trim() || "chunk.part";
  const contentTypeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(text.slice(0, headerEnd));
  const contentType = contentTypeMatch?.[1]?.trim() || "application/octet-stream";
  return {
    filename,
    contentType,
    data: body.slice(dataStart, dataEnd),
  };
}

export async function proxyStorageUpload(
  request: StorageUploadRequest,
  config: MediaGatewayConfig,
  options: StorageUploadOptions = {},
  accessGate: AccessGateConfig = accessGateConfigFromEnv(process.env),
  deploymentMode: "development" | "production" = "production",
): Promise<StorageUploadResponse | null> {
  if (deploymentMode === "production" && !isTrustedSameOriginRequest(request)) {
    return jsonError(403, "cross_origin_forbidden");
  }
  if (!isRequestUnlocked(request, accessGate)) return jsonError(401, "access_locked");
  if (!isStorageUploadConfigured(config)) return jsonError(503, "storage_unavailable");
  if (request.method !== "POST") {
    return jsonError(405, "invalid_request", "Only POST chunk uploads are supported.");
  }

  const boundary = parseMultipartContentType(request.contentType);
  if (!boundary) return jsonError(415, "invalid_content_type");

  const uploadId = request.uploadId?.trim() ?? "";
  const chunkIndex = parseChunkIndex(request.chunkIndex);
  if (!UPLOAD_ID_RE.test(uploadId) || chunkIndex === null) {
    return jsonError(400, "invalid_request", "uploadId and chunkIndex are required.");
  }

  const maxChunkBytes = options.maxChunkBytes ?? STORAGE_CHUNK_MAX_BYTES;
  const declaredLength = parseContentLength(request.contentLength);
  if (declaredLength !== null && declaredLength > maxChunkBytes) {
    return jsonError(413, "upload_too_large");
  }

  const controller = new AbortController();
  const abortFromClient = () => controller.abort("client_disconnected");
  request.signal?.addEventListener("abort", abortFromClient, { once: true });

  try {
    const body = await readBoundedBody(request.body, maxChunkBytes, controller.signal);
    if (controller.signal.aborted) return null;
    if (body.byteLength === 0) return jsonError(500, "request_body_unavailable");

    const file = extractMultipartFile(body, boundary);
    if (!file || file.data.byteLength === 0) {
      return jsonError(400, "invalid_request", "Chunk file field is required.");
    }

    const partName = `${String(chunkIndex).padStart(5, "0")}.part`;
    const folder = `${config.uploadPrefix}/source-audio/chunks/${uploadId}`;
    const uploaded = await uploadToMediaGateway(
      config,
      {
        folder,
        filename: partName,
        contentType: file.contentType || "application/octet-stream",
        body: file.data,
        preserveFilename: true,
      },
      options,
    );

    const expectedKey = studioChunkObjectKey(config.uploadPrefix, uploadId, chunkIndex);
    if (uploaded.objectKey !== expectedKey) {
      return jsonError(502, "storage_unavailable", "Chunk staging returned an unexpected object key.");
    }

    return {
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        upload_id: uploadId,
        chunk_index: chunkIndex,
        object_key: uploaded.objectKey,
        size: file.data.byteLength,
      }),
    };
  } catch (error) {
    if (error instanceof LimitExceededError) return jsonError(413, "upload_too_large");
    if (request.signal?.aborted || controller.signal.aborted) return null;
    return jsonError(400, "invalid_request", "Chunk upload could not be read.");
  } finally {
    request.signal?.removeEventListener("abort", abortFromClient);
  }
}
