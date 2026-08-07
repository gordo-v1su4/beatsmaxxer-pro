import {
  ACCESS_COOKIE_NAME,
  accessGateConfigFromEnv,
  isAccessGateEnabled,
  isValidSessionToken,
  parseCookie,
  type AccessGateConfig,
} from "../gate/policy.js";

export const ANALYSIS_PROXY_ENABLE_ENV = "ESSENTIA_ANALYSIS_ENABLED";
export const ANALYSIS_MAX_REQUEST_BYTES = 3_500_000;
export const ANALYSIS_MAX_RESPONSE_BYTES = 1_000_000;
export const ANALYSIS_UPSTREAM_TIMEOUT_MS = 15_000;
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

export async function proxyAnalysisRequest(
  request: AnalysisProxyRequest,
  config: AnalysisProxyConfig,
  options: AnalysisProxyOptions = {},
  accessGate: AccessGateConfig = accessGateConfigFromEnv(process.env),
): Promise<AnalysisProxyResponse | null> {
  const endpoint = request.endpoint;
  if (endpoint !== "fast" && endpoint !== "rhythm") return jsonError(404, "not_found", "Analysis endpoint not found.");
  if (request.method !== "POST") return jsonError(405, "method_not_allowed", "Only POST analysis requests are supported.");
  // The Vercel production route is additionally protected by an IP-keyed WAF
  // rate limit. Keep this same-origin check in the function as defense in depth
  // and reject before reading a user upload or contacting the upstream service.
  if (config.deploymentMode === "production" && !isTrustedSameOriginRequest(request)) {
    return jsonError(403, "cross_origin_forbidden");
  }
  // The access gate is the only control here that a request cannot simply assert
  // its way past: Origin and Sec-Fetch-Site are attacker-controlled outside a
  // browser, whereas this cookie requires having entered the PIN. When no PIN is
  // configured the gate is disabled and this is a no-op.
  if (!isRequestUnlocked(request, accessGate)) return jsonError(401, "access_locked");
  if (!config.enabled) return jsonError(503, "analysis_disabled");
  if (!isAnalysisProxyConfigured(config)) return jsonError(503, "analysis_unavailable");
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
    // Nothing readable behind a declared Content-Length means the host drained
    // the stream first. Name that rather than forwarding an empty envelope and
    // surfacing it as an opaque upstream rejection.
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
    if (!isJsonContentType(upstream.headers.get("content-type"))) {
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

function isJsonContentType(value: string | null) {
  return Boolean(value && /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(value));
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
