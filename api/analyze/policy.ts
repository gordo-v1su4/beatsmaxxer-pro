import {
  ACCESS_COOKIE_NAME,
  accessGateConfigFromEnv,
  isAccessGateEnabled,
  isValidSessionToken,
  parseCookie,
  type AccessGateConfig,
} from "../gate/policy.js";
import { deleteGatewayObjects, mediaGatewayConfigFromEnv } from "../lib/mediaGateway.js";
import {
  buildStudioMultipartBody,
  parseStudioChunkManifest,
  reassembleStudioChunks,
  STUDIO_MANIFEST_MAX_BYTES,
  validateStudioChunkManifest,
} from "../lib/studioChunkManifest.js";

export const ANALYSIS_PROXY_ENABLE_ENV = "ESSENTIA_ANALYSIS_ENABLED";
/** Full MP3 uploads (~7 MiB typical). Vercel may require Pro for bodies above ~4.5 MiB. */
export const ANALYSIS_MAX_REQUEST_BYTES = 12_000_000;
export const ANALYSIS_MAX_RESPONSE_BYTES = 2_000_000;
export const ANALYSIS_UPSTREAM_TIMEOUT_MS = 15_000;
export const ANALYSIS_STUDIO_SUBMIT_TIMEOUT_MS = 120_000;
export const ANALYSIS_STUDIO_POLL_TIMEOUT_MS = 30_000;
export const ANALYSIS_MAX_CONCURRENT_REQUESTS = 2;

export type AnalysisEndpoint = "fast" | "rhythm";

export interface AnalysisProxyConfig {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  deploymentMode: "development" | "production";
}

export interface AnalysisProxyRequest {
  method?: string;
  endpoint?: string;
  contentType?: string;
  contentLength?: string;
  idempotencyKey?: string;
  origin?: string;
  host?: string;
  forwardedProto?: string;
  fetchSite?: string;
  cookieHeader?: string;
  body: AsyncIterable<Uint8Array>;
  signal?: AbortSignal;
}

export interface AnalysisProxyResponse {
  status: number;
  contentType: "application/json";
  body: string;
}

export interface AnalysisProxyOptions {
  fetch?: typeof globalThis.fetch;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  maxConcurrentRequests?: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  access_locked: "This deployment is locked. Enter the access code to use hosted analysis.",
  analysis_disabled: "Hosted analysis is disabled. Local playback and realtime analysis remain available.",
  analysis_unavailable: "Hosted analysis is unavailable. Local playback and realtime analysis remain available.",
  cross_origin_forbidden: "Hosted analysis requests must come from this application.",
  invalid_content_type: "Analysis uploads must use multipart/form-data with a valid boundary.",
  invalid_manifest: "Chunk manifest is invalid or does not match staged upload metadata.",
  upload_too_large: "Analysis upload exceeds the allowed request size.",
  analysis_busy: "Hosted analysis is busy. Try again later or use realtime analysis.",
  request_body_unavailable: "The analysis upload could not be read by the server. Realtime analysis remains available.",
  upstream_timeout: "Hosted analysis timed out. Realtime analysis remains available.",
  upstream_rejected: "Hosted analysis rejected the upload.",
  upstream_unavailable: "Hosted analysis is unavailable. Realtime analysis remains available.",
  upstream_response_too_large: "Hosted analysis returned an invalid response.",
};

let activeRequests = 0;

export function analysisProxyConfigFromEnv(
  env: Record<string, string | undefined>,
  deploymentMode: AnalysisProxyConfig["deploymentMode"] = "production",
): AnalysisProxyConfig {
  return {
    enabled: env[ANALYSIS_PROXY_ENABLE_ENV]?.trim().toLowerCase() === "true",
    apiBaseUrl: (env.ESSENTIA_API_BASE_URL ?? "").trim().replace(/\/+$/, ""),
    apiKey: (env.ESSENTIA_API_KEY ?? "").trim(),
    deploymentMode,
  };
}

function isTailscaleCgnatHost(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false;
  return parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

export function isAnalysisProxyConfigured(config: AnalysisProxyConfig) {
  return isAnalysisUploadPathEnabled(config) && Boolean(config.apiKey);
}

/**
 * Build-time gate for the browser upload path. Deliberately key-free: the key is
 * a runtime-only secret the Vercel build step may never see, and requiring it
 * here compiled ANALYZE off in the production bundle with no diagnostic. The
 * function still applies the full check and answers 503 analysis_unavailable, so
 * a missing credential fails loudly rather than silently.
 */
export function isAnalysisUploadPathEnabled(config: Pick<AnalysisProxyConfig, "enabled" | "apiBaseUrl">) {
  if (!config.enabled || !config.apiBaseUrl) return false;
  try {
    const url = new URL(config.apiBaseUrl);
    const allowedProtocol = url.protocol === "https:" ||
      ((url.hostname === "localhost" || url.hostname === "127.0.0.1" || isTailscaleCgnatHost(url.hostname)) &&
        url.protocol === "http:");
    return allowedProtocol && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function isJsonContentType(value: string | undefined): boolean {
  return Boolean(value && /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(value));
}

export function parseMultipartContentType(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^\s;]+))\s*$/i);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary || boundary.length > 70) return null;
  // RFC 2046 bchars, ending in bcharsnospace. We validate only the outer envelope.
  return /^[0-9A-Za-z'()+_,\-.\/:=? ]*[0-9A-Za-z'()+_,\-.\/:=?]$/.test(boundary)
    ? boundary
    : null;
}

export function isTrustedSameOriginRequest(request: Pick<
  AnalysisProxyRequest,
  "origin" | "host" | "forwardedProto" | "fetchSite"
>) {
  if (!request.origin || !request.host) return false;
  if (request.fetchSite && request.fetchSite !== "same-origin") return false;

  try {
    const origin = new URL(request.origin);
    const forwardedProto = request.forwardedProto?.split(",")[0]?.trim().toLowerCase();
    const expectedProtocol = forwardedProto ? `${forwardedProto}:` : origin.protocol;
    const host = request.host.split(",")[0]?.trim().toLowerCase();
    return (
      Boolean(host) &&
      origin.protocol === expectedProtocol &&
      origin.host.toLowerCase() === host &&
      !origin.username &&
      !origin.password &&
      !origin.search &&
      !origin.hash
    );
  } catch {
    return false;
  }
}

function isRequestUnlocked(request: AnalysisProxyRequest, gate: AccessGateConfig) {
  if (!isAccessGateEnabled(gate)) return true;
  return isValidSessionToken(parseCookie(request.cookieHeader, ACCESS_COOKIE_NAME), gate);
}

function parseProxyRoute(endpoint: string | undefined) {
  if (!endpoint) return null;
  if (endpoint === "studio/jobs") return { kind: "studio-submit" as const };
  const poll = endpoint.match(/^studio\/jobs\/([^/]+)$/);
  if (poll?.[1]) return { kind: "studio-poll" as const, jobId: poll[1] };
  if (endpoint === "fast" || endpoint === "rhythm") {
    return { kind: "legacy" as const, name: endpoint as AnalysisEndpoint };
  }
  return null;
}

function guardAnalysisProxy(
  request: AnalysisProxyRequest,
  config: AnalysisProxyConfig,
  accessGate: AccessGateConfig,
): AnalysisProxyResponse | null {
  if (config.deploymentMode === "production" && !isTrustedSameOriginRequest(request)) {
    return jsonError(403, "cross_origin_forbidden");
  }
  if (!isRequestUnlocked(request, accessGate)) return jsonError(401, "access_locked");
  if (!config.enabled) return jsonError(503, "analysis_disabled");
  if (!isAnalysisProxyConfigured(config)) return jsonError(503, "analysis_unavailable");
  return null;
}

export async function proxyAnalysisRequest(
  request: AnalysisProxyRequest,
  config: AnalysisProxyConfig,
  options: AnalysisProxyOptions = {},
  accessGate: AccessGateConfig = accessGateConfigFromEnv(process.env),
): Promise<AnalysisProxyResponse | null> {
  const route = parseProxyRoute(request.endpoint);
  if (!route) return jsonError(404, "not_found", "Analysis endpoint not found.");

  const guard = guardAnalysisProxy(request, config, accessGate);
  if (guard) return guard;

  if (route.kind === "studio-submit") {
    if (request.method !== "POST") {
      return jsonError(405, "method_not_allowed", "Only POST studio job submissions are supported.");
    }
    return proxyStudioJobSubmit(request, config, options);
  }

  if (route.kind === "studio-poll") {
    if (request.method !== "GET") {
      return jsonError(405, "method_not_allowed", "Only GET studio job polling is supported.");
    }
    return proxyStudioJobPoll(route.jobId, request, config, options);
  }

  if (request.method !== "POST") {
    return jsonError(405, "method_not_allowed", "Only POST analysis requests are supported.");
  }
  return proxyLegacyAnalysisRequest(request, config, options, route.name);
}

async function proxyLegacyAnalysisRequest(
  request: AnalysisProxyRequest,
  config: AnalysisProxyConfig,
  options: AnalysisProxyOptions,
  endpoint: AnalysisEndpoint,
): Promise<AnalysisProxyResponse | null> {
  if (!parseMultipartContentType(request.contentType)) return jsonError(415, "invalid_content_type");

  const maxRequestBytes = options.maxRequestBytes ?? ANALYSIS_MAX_REQUEST_BYTES;
  const declaredLength = parseContentLength(request.contentLength);
  if (declaredLength !== null && declaredLength > maxRequestBytes) {
    return jsonError(413, "upload_too_large");
  }

  const maxConcurrent = options.maxConcurrentRequests ?? ANALYSIS_MAX_CONCURRENT_REQUESTS;
  if (activeRequests >= maxConcurrent) return jsonError(429, "analysis_busy");
  activeRequests += 1;

  const controller = new AbortController();
  const abortFromClient = () => controller.abort("client_disconnected");
  request.signal?.addEventListener("abort", abortFromClient, { once: true });
  const timeout = setTimeout(
    () => controller.abort("upstream_timeout"),
    options.timeoutMs ?? ANALYSIS_UPSTREAM_TIMEOUT_MS,
  );

  try {
    const body = await readBoundedBody(request.body, maxRequestBytes, controller.signal);
    if (controller.signal.aborted) return null;
    if (body.byteLength === 0) return jsonError(500, "request_body_unavailable");

    let upstream: Response;
    try {
      upstream = await (options.fetch ?? globalThis.fetch)(`${config.apiBaseUrl}/analyze/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": request.contentType!,
          "X-API-Key": config.apiKey,
        },
        body,
        signal: controller.signal,
      });
    } catch {
      if (request.signal?.aborted || controller.signal.reason === "client_disconnected") return null;
      if (controller.signal.reason === "upstream_timeout") return jsonError(504, "upstream_timeout");
      return jsonError(502, "upstream_unavailable");
    }

    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => undefined);
      return mapUpstreamFailure(upstream.status);
    }

    return await forwardJsonUpstream(upstream, controller, request, options);
  } catch (error) {
    if (error instanceof LimitExceededError) {
      controller.abort("upload_too_large");
      return jsonError(413, "upload_too_large");
    }
    if (request.signal?.aborted || controller.signal.reason === "client_disconnected") return null;
    if (controller.signal.reason === "upstream_timeout") return jsonError(504, "upstream_timeout");
    return jsonError(400, "invalid_request", "Analysis request could not be read.");
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abortFromClient);
    activeRequests -= 1;
  }
}

async function proxyStudioJobSubmit(
  request: AnalysisProxyRequest,
  config: AnalysisProxyConfig,
  options: AnalysisProxyOptions,
): Promise<AnalysisProxyResponse | null> {
  if (isJsonContentType(request.contentType)) {
    return proxyStudioJobManifestSubmit(request, config, options);
  }
  if (!parseMultipartContentType(request.contentType)) return jsonError(415, "invalid_content_type");

  const maxRequestBytes = options.maxRequestBytes ?? ANALYSIS_MAX_REQUEST_BYTES;
  const declaredLength = parseContentLength(request.contentLength);
  if (declaredLength !== null && declaredLength > maxRequestBytes) {
    return jsonError(413, "upload_too_large");
  }

  const maxConcurrent = options.maxConcurrentRequests ?? ANALYSIS_MAX_CONCURRENT_REQUESTS;
  if (activeRequests >= maxConcurrent) return jsonError(429, "analysis_busy");
  activeRequests += 1;

  const controller = new AbortController();
  const abortFromClient = () => controller.abort("client_disconnected");
  request.signal?.addEventListener("abort", abortFromClient, { once: true });
  const timeout = setTimeout(
    () => controller.abort("upstream_timeout"),
    options.timeoutMs ?? ANALYSIS_STUDIO_SUBMIT_TIMEOUT_MS,
  );

  try {
    const body = await readBoundedBody(request.body, maxRequestBytes, controller.signal);
    if (controller.signal.aborted) return null;
    if (body.byteLength === 0) return jsonError(500, "request_body_unavailable");

    const headers: Record<string, string> = {
      "Content-Type": request.contentType!,
      "X-API-Key": config.apiKey,
    };
    if (request.idempotencyKey) headers["Idempotency-Key"] = request.idempotencyKey;

    let upstream: Response;
    try {
      upstream = await (options.fetch ?? globalThis.fetch)(`${config.apiBaseUrl}/analyze/studio/jobs`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
    } catch {
      if (request.signal?.aborted || controller.signal.reason === "client_disconnected") return null;
      if (controller.signal.reason === "upstream_timeout") return jsonError(504, "upstream_timeout");
      return jsonError(502, "upstream_unavailable");
    }

    return await forwardJsonUpstream(upstream, controller, request, options);
  } catch (error) {
    if (error instanceof LimitExceededError) {
      controller.abort("upload_too_large");
      return jsonError(413, "upload_too_large");
    }
    if (request.signal?.aborted || controller.signal.reason === "client_disconnected") return null;
    if (controller.signal.reason === "upstream_timeout") return jsonError(504, "upstream_timeout");
    return jsonError(400, "invalid_request", "Analysis request could not be read.");
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abortFromClient);
    activeRequests -= 1;
  }
}

async function proxyStudioJobManifestSubmit(
  request: AnalysisProxyRequest,
  config: AnalysisProxyConfig,
  options: AnalysisProxyOptions,
): Promise<AnalysisProxyResponse | null> {
  const gateway = mediaGatewayConfigFromEnv(process.env);
  const manifestError = validateStudioChunkManifestGateway(gateway);
  if (manifestError) return manifestError;

  const declaredLength = parseContentLength(request.contentLength);
  if (declaredLength !== null && declaredLength > STUDIO_MANIFEST_MAX_BYTES) {
    return jsonError(413, "upload_too_large");
  }

  const maxConcurrent = options.maxConcurrentRequests ?? ANALYSIS_MAX_CONCURRENT_REQUESTS;
  if (activeRequests >= maxConcurrent) return jsonError(429, "analysis_busy");
  activeRequests += 1;

  const controller = new AbortController();
  const abortFromClient = () => controller.abort("client_disconnected");
  request.signal?.addEventListener("abort", abortFromClient, { once: true });
  const timeout = setTimeout(
    () => controller.abort("upstream_timeout"),
    options.timeoutMs ?? ANALYSIS_STUDIO_SUBMIT_TIMEOUT_MS,
  );

  try {
    const body = await readBoundedBody(request.body, STUDIO_MANIFEST_MAX_BYTES, controller.signal);
    if (controller.signal.aborted) return null;
    if (body.byteLength === 0) return jsonError(500, "request_body_unavailable");

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return jsonError(400, "invalid_manifest");
    }

    const manifest = parseStudioChunkManifest(parsed);
    if (!manifest) return jsonError(400, "invalid_manifest");

    const validationCode = validateStudioChunkManifest(
      manifest,
      gateway,
      options.maxRequestBytes ?? ANALYSIS_MAX_REQUEST_BYTES,
    );
    if (validationCode) return jsonError(400, validationCode);

    const mp3Bytes = await reassembleStudioChunks(manifest, gateway, options);
    const multipart = buildStudioMultipartBody(manifest.filename, mp3Bytes);

    const headers: Record<string, string> = {
      "Content-Type": multipart.contentType,
      "X-API-Key": config.apiKey,
    };
    if (request.idempotencyKey) headers["Idempotency-Key"] = request.idempotencyKey;

    let upstream: Response;
    try {
      upstream = await (options.fetch ?? globalThis.fetch)(`${config.apiBaseUrl}/analyze/studio/jobs`, {
        method: "POST",
        headers,
        body: multipart.body as BodyInit,
        signal: controller.signal,
      });
    } catch {
      if (request.signal?.aborted || controller.signal.reason === "client_disconnected") return null;
      if (controller.signal.reason === "upstream_timeout") return jsonError(504, "upstream_timeout");
      return jsonError(502, "upstream_unavailable");
    }

    const result = await forwardJsonUpstream(upstream, controller, request, options);
    if (result?.status && result.status >= 200 && result.status < 300) {
      await deleteGatewayObjects(
        gateway,
        manifest.chunks.map((chunk) => chunk.object_key),
        options,
      ).catch(() => undefined);
    }
    return result;
  } catch (error) {
    if (error instanceof LimitExceededError) {
      controller.abort("upload_too_large");
      return jsonError(413, "upload_too_large");
    }
    if (request.signal?.aborted || controller.signal.reason === "client_disconnected") return null;
    if (controller.signal.reason === "upstream_timeout") return jsonError(504, "upstream_timeout");
    return jsonError(400, "invalid_manifest", "Chunk manifest could not be processed.");
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abortFromClient);
    activeRequests -= 1;
  }
}

function validateStudioChunkManifestGateway(
  gateway: ReturnType<typeof mediaGatewayConfigFromEnv>,
): AnalysisProxyResponse | null {
  if (!gateway.url || !gateway.token || !gateway.bucket || !gateway.userId || !gateway.uploadPrefix) {
    return jsonError(503, "analysis_unavailable", "Chunk staging is not configured for hosted analysis.");
  }
  return null;
}

async function proxyStudioJobPoll(
  jobId: string,
  request: AnalysisProxyRequest,
  config: AnalysisProxyConfig,
  options: AnalysisProxyOptions,
): Promise<AnalysisProxyResponse | null> {
  const controller = new AbortController();
  const abortFromClient = () => controller.abort("client_disconnected");
  request.signal?.addEventListener("abort", abortFromClient, { once: true });
  const timeout = setTimeout(
    () => controller.abort("upstream_timeout"),
    options.timeoutMs ?? ANALYSIS_STUDIO_POLL_TIMEOUT_MS,
  );

  try {
    let upstream: Response;
    try {
      upstream = await (options.fetch ?? globalThis.fetch)(
        `${config.apiBaseUrl}/analyze/studio/jobs/${encodeURIComponent(jobId)}`,
        {
          method: "GET",
          headers: { "X-API-Key": config.apiKey },
          signal: controller.signal,
        },
      );
    } catch {
      if (request.signal?.aborted || controller.signal.reason === "client_disconnected") return null;
      if (controller.signal.reason === "upstream_timeout") return jsonError(504, "upstream_timeout");
      return jsonError(502, "upstream_unavailable");
    }

    return await forwardJsonUpstream(upstream, controller, request, options);
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abortFromClient);
  }
}

async function forwardJsonUpstream(
  upstream: Response,
  controller: AbortController,
  request: AnalysisProxyRequest,
  options: AnalysisProxyOptions,
): Promise<AnalysisProxyResponse | null> {
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    return mapUpstreamFailure(upstream.status);
  }
  if (!isJsonContentType(upstream.headers.get("content-type") ?? undefined)) {
    await upstream.body?.cancel().catch(() => undefined);
    return jsonError(502, "upstream_unavailable");
  }

  try {
    const responseBytes = await readBoundedResponse(
      upstream,
      options.maxResponseBytes ?? ANALYSIS_MAX_RESPONSE_BYTES,
      controller.signal,
    );
    const responseText = new TextDecoder().decode(responseBytes);
    JSON.parse(responseText);
    return { status: upstream.status, contentType: "application/json", body: responseText };
  } catch (error) {
    if (error instanceof LimitExceededError) {
      controller.abort("upstream_response_too_large");
      return jsonError(502, "upstream_response_too_large");
    }
    if (request.signal?.aborted) return null;
    if (controller.signal.reason === "upstream_timeout") return jsonError(504, "upstream_timeout");
    return jsonError(502, "upstream_unavailable");
  }
}

class LimitExceededError extends Error {}

async function readBoundedBody(
  body: AsyncIterable<Uint8Array>,
  limit: number,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const iterator = body[Symbol.asyncIterator]();
  while (true) {
    const next = await nextWithAbort(iterator.next(), signal);
    if (next.done) break;
    const chunk = next.value;
    total += chunk.byteLength;
    if (total > limit) throw new LimitExceededError();
    chunks.push(chunk);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

function nextWithAbort<T>(next: Promise<IteratorResult<T>>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<IteratorResult<T>>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    next.then(
      (value) => { cleanup(); resolve(value); },
      (error) => { cleanup(); reject(error); },
    );
  });
}

function abortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

async function readBoundedResponse(response: Response, limit: number, signal: AbortSignal) {
  const declaredLength = parseContentLength(response.headers.get("content-length") ?? undefined);
  if (declaredLength !== null && declaredLength > limit) throw new LimitExceededError();
  if (!response.body) return new ArrayBuffer(0);
  return readBoundedBody(response.body, limit, signal);
}

function parseContentLength(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function mapUpstreamFailure(status: number) {
  if (status === 400 || status === 413 || status === 422) {
    return jsonError(status, "upstream_rejected");
  }
  if (status === 429 || status === 503) return jsonError(503, "upstream_unavailable");
  return jsonError(502, "upstream_unavailable");
}

function jsonError(status: number, code: string, message = ERROR_MESSAGES[code] ?? "Analysis request failed.") {
  return {
    status,
    contentType: "application/json" as const,
    body: JSON.stringify({ code, detail: message }),
  };
}
