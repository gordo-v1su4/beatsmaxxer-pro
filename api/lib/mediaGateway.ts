export const MEDIA_GATEWAY_URL_ENV = "MEDIA_GATEWAY_URL";
export const MEDIA_GATEWAY_TOKEN_ENV = "MEDIA_GATEWAY_TOKEN";
export const MEDIA_GATEWAY_BUCKET_ENV = "MEDIA_GATEWAY_BUCKET";
export const MEDIA_GATEWAY_USER_ID_ENV = "MEDIA_GATEWAY_USER_ID";
export const MEDIA_GATEWAY_UPLOAD_PREFIX_ENV = "MEDIA_GATEWAY_UPLOAD_PREFIX";

export const DEFAULT_MEDIA_GATEWAY_UPLOAD_PREFIX = "media-uploads";

export interface MediaGatewayConfig {
  url: string;
  token: string;
  bucket: string;
  userId: string;
  uploadPrefix: string;
}

export interface MediaGatewayUploadResult {
  bucket: string;
  objectKey: string;
  publicUrl: string;
  mime: string;
}

export function mediaGatewayConfigFromEnv(
  env: Record<string, string | undefined>,
): MediaGatewayConfig {
  return {
    url: (env[MEDIA_GATEWAY_URL_ENV] ?? "").trim().replace(/\/+$/, ""),
    token: (env[MEDIA_GATEWAY_TOKEN_ENV] ?? "").trim(),
    bucket: (env[MEDIA_GATEWAY_BUCKET_ENV] ?? "").trim(),
    userId: (env[MEDIA_GATEWAY_USER_ID_ENV] ?? "").trim(),
    uploadPrefix: (env[MEDIA_GATEWAY_UPLOAD_PREFIX_ENV] ?? DEFAULT_MEDIA_GATEWAY_UPLOAD_PREFIX)
      .trim()
      .replace(/^\/+|\/+$/g, ""),
  };
}

export function isMediaGatewayConfigured(config: MediaGatewayConfig): boolean {
  if (!config.url || !config.token || !config.bucket || !config.userId) return false;
  try {
    const url = new URL(config.url);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function studioChunkFolder(uploadPrefix: string, uploadId: string): string {
  return `${uploadPrefix}/source-audio/chunks/${uploadId}`;
}

export function studioChunkObjectKey(uploadPrefix: string, uploadId: string, chunkIndex: number): string {
  const partName = `${String(chunkIndex).padStart(5, "0")}.part`;
  return `${studioChunkFolder(uploadPrefix, uploadId)}/${partName}`;
}

export function rustfsPublicObjectUrl(bucket: string, objectKey: string): string {
  const key = objectKey.replace(/^\/+/, "");
  return `https://s3.v1su4.dev/${bucket}/${key}`;
}

function gatewayAuthHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function uploadToMediaGateway(
  config: MediaGatewayConfig,
  input: {
    folder: string;
    filename: string;
    contentType: string;
    body: Uint8Array | ArrayBuffer;
    preserveFilename?: boolean;
  },
  options: { fetch?: typeof globalThis.fetch } = {},
): Promise<MediaGatewayUploadResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const form = new FormData();
  form.set("userId", config.userId);
  form.set("bucket", config.bucket);
  form.set("folder", input.folder);
  form.set("preserveFilename", input.preserveFilename ? "true" : "false");
  form.set(
    "file",
    new Blob([input.body instanceof Uint8Array ? input.body : new Uint8Array(input.body)], {
      type: input.contentType,
    }),
    input.filename,
  );

  const response = await fetchImpl(`${config.url}/upload`, {
    method: "POST",
    headers: gatewayAuthHeaders(config.token),
    body: form,
  });

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(`Media gateway upload failed: ${detail}`);
  }

  const objectKey = typeof payload?.objectKey === "string"
    ? payload.objectKey
    : typeof payload?.path === "string"
      ? payload.path
      : "";
  const publicUrl = typeof payload?.publicUrl === "string" ? payload.publicUrl : "";
  const mime = typeof payload?.mime === "string" ? payload.mime : input.contentType;
  if (!objectKey) throw new Error("Media gateway upload returned an invalid response.");

  return {
    bucket: typeof payload?.bucket === "string" ? payload.bucket : config.bucket,
    objectKey,
    publicUrl,
    mime,
  };
}

export async function fetchGatewayObject(
  config: MediaGatewayConfig,
  objectKey: string,
  options: { fetch?: typeof globalThis.fetch } = {},
): Promise<Uint8Array> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const url = rustfsPublicObjectUrl(config.bucket, objectKey);
  const response = await fetchImpl(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Failed to fetch staged object ${objectKey}: HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function deleteGatewayObjects(
  config: MediaGatewayConfig,
  objectKeys: string[],
  options: { fetch?: typeof globalThis.fetch } = {},
): Promise<void> {
  if (objectKeys.length === 0) return;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const response = await fetchImpl(`${config.url}/delete`, {
    method: "POST",
    headers: {
      ...gatewayAuthHeaders(config.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bucket: config.bucket, objectKeys }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    const detail = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(`Media gateway delete failed: ${detail}`);
  }
}
