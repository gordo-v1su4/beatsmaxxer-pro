import { describe, expect, it, vi } from "vitest";
import {
  analysisProxyConfigFromEnv,
  isAnalysisProxyConfigured,
  isAnalysisUploadPathEnabled,
  isTrustedSameOriginRequest,
  parseMultipartContentType,
  proxyAnalysisRequest,
  type AnalysisProxyConfig,
} from "../../../../api/analyze/policy";
import { ACCESS_COOKIE_NAME, mintSessionToken } from "../../../../api/gate/policy";

const enabledConfig: AnalysisProxyConfig = {
  enabled: true,
  apiBaseUrl: "https://analysis.invalid",
  apiKey: "server-secret",
  deploymentMode: "development",
};
const contentType = "multipart/form-data; boundary=fixture-boundary";

function stream(...chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

function request(body = new Uint8Array([1, 2, 3])) {
  return {
    method: "POST",
    endpoint: "rhythm",
    contentType,
    body: stream(body),
  };
}

describe("analysis proxy access gate", () => {
  const locked = { pin: "4821" };

  it("refuses hosted analysis without a session when a PIN is configured", async () => {
    const fetch = vi.fn();
    let read = false;
    const body = { async *[Symbol.asyncIterator]() { read = true; yield new Uint8Array([1]); } };
    const result = await proxyAnalysisRequest(
      { ...request(), body },
      enabledConfig,
      { fetch: fetch as typeof globalThis.fetch },
      locked,
    );
    expect(result?.status).toBe(401);
    expect(result?.body).toContain("access_locked");
    // Rejected before the upload is read or the credential is spent.
    expect(read).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows hosted analysis once the session cookie is present", async () => {
    const fetch = vi.fn(async () => new Response('{"bpm":120}', {
      headers: { "Content-Type": "application/json" },
    }));
    const result = await proxyAnalysisRequest(
      { ...request(), cookieHeader: `${ACCESS_COOKIE_NAME}=${mintSessionToken(locked)}` },
      enabledConfig,
      { fetch: fetch as typeof globalThis.fetch },
      locked,
    );
    expect(result?.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when no PIN is configured", async () => {
    const fetch = vi.fn(async () => new Response('{"bpm":120}', {
      headers: { "Content-Type": "application/json" },
    }));
    const result = await proxyAnalysisRequest(
      request(),
      enabledConfig,
      { fetch: fetch as typeof globalThis.fetch },
      { pin: "" },
    );
    expect(result?.status).toBe(200);
  });
});

describe("analysis proxy policy", () => {
  it("accepts Tailscale CGNAT http bases for the development proxy", () => {
    expect(isAnalysisProxyConfigured({
      enabled: true,
      apiBaseUrl: "http://100.73.126.36:8080",
      apiKey: "server-secret",
      deploymentMode: "development",
    })).toBe(true);
    expect(isAnalysisProxyConfigured({
      enabled: true,
      apiBaseUrl: "http://10.0.0.5:8080",
      apiKey: "server-secret",
      deploymentMode: "development",
    })).toBe(false);
  });

  it("gates the browser upload path without needing the runtime-only credential", () => {
    // The key is a server secret that the Vercel build step may never see.
    // Requiring it here is what compiled ANALYZE off in the production bundle.
    const keyless = { enabled: true, apiBaseUrl: "https://analysis.invalid", apiKey: "" };
    expect(isAnalysisUploadPathEnabled(keyless)).toBe(true);
    expect(isAnalysisProxyConfigured({ ...keyless, deploymentMode: "production" })).toBe(false);

    expect(isAnalysisUploadPathEnabled({ enabled: false, apiBaseUrl: "https://analysis.invalid" })).toBe(false);
    expect(isAnalysisUploadPathEnabled({ enabled: true, apiBaseUrl: "" })).toBe(false);
    expect(isAnalysisUploadPathEnabled({ enabled: true, apiBaseUrl: "http://insecure.invalid" })).toBe(false);
  });

  it("names an unreadable request body instead of blaming the upstream service", async () => {
    const fetch = vi.fn();
    const result = await proxyAnalysisRequest(
      { ...request(), body: stream() },
      enabledConfig,
      { fetch: fetch as typeof globalThis.fetch },
    );
    expect(result?.status).toBe(500);
    expect(result?.body).toContain("request_body_unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is default-off and ignores client-visible aliases", () => {
    expect(analysisProxyConfigFromEnv({
      VITE_ESSENTIA_API_BASE_URL: "https://leak.invalid",
      VITE_ESSENTIA_API_KEY: "leak",
    })).toEqual({ enabled: false, apiBaseUrl: "", apiKey: "", deploymentMode: "production" });
  });

  it("rejects untrusted production requests before reading or forwarding", async () => {
    const fetch = vi.fn();
    let read = false;
    const body = { async *[Symbol.asyncIterator]() { read = true; yield new Uint8Array([1]); } };
    const result = await proxyAnalysisRequest(
      { ...request(), body },
      { ...enabledConfig, deploymentMode: "production" },
      { fetch: fetch as typeof globalThis.fetch },
    );
    expect(result?.status).toBe(403);
    expect(result?.body).toContain("cross_origin_forbidden");
    expect(result?.body).not.toContain("server-secret");
    expect(read).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts configured same-origin production requests", async () => {
    const fetch = vi.fn(async () => new Response('{"bpm":120}', {
      headers: { "Content-Type": "application/json" },
    }));
    const result = await proxyAnalysisRequest(
      {
        ...request(),
        origin: "https://beat-surfer-pro.vercel.app",
        host: "beat-surfer-pro.vercel.app",
        forwardedProto: "https",
        fetchSite: "same-origin",
      },
      { ...enabledConfig, deploymentMode: "production" },
      { fetch: fetch as typeof globalThis.fetch },
    );
    expect(result).toEqual({ status: 200, contentType: "application/json", body: '{"bpm":120}' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("requires an exact same-origin host, protocol, and fetch-site", () => {
    expect(isTrustedSameOriginRequest({
      origin: "https://app.example",
      host: "app.example",
      forwardedProto: "https",
      fetchSite: "same-origin",
    })).toBe(true);
    expect(isTrustedSameOriginRequest({ origin: "https://evil.example", host: "app.example" })).toBe(false);
    expect(isTrustedSameOriginRequest({ origin: "http://app.example", host: "app.example", forwardedProto: "https" })).toBe(false);
    expect(isTrustedSameOriginRequest({ origin: "https://app.example", host: "app.example", fetchSite: "cross-site" })).toBe(false);
    expect(isTrustedSameOriginRequest({ origin: "not a URL", host: "app.example" })).toBe(false);
  });

  it("fails closed before fetch when disabled or missing server configuration", async () => {
    const fetch = vi.fn();
    const disabled = await proxyAnalysisRequest(request(), { ...enabledConfig, enabled: false }, {
      fetch: fetch as typeof globalThis.fetch,
    });
    const missingKey = await proxyAnalysisRequest(request(), { ...enabledConfig, apiKey: "" }, {
      fetch: fetch as typeof globalThis.fetch,
    });
    const missingBase = await proxyAnalysisRequest(request(), { ...enabledConfig, apiBaseUrl: "" }, {
      fetch: fetch as typeof globalThis.fetch,
    });
    expect(disabled?.status).toBe(503);
    expect(missingKey?.status).toBe(503);
    expect(missingBase?.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects methods, endpoints, and invalid outer content types without reading or fetching", async () => {
    const fetch = vi.fn();
    let read = false;
    const body = { async *[Symbol.asyncIterator]() { read = true; yield new Uint8Array(); } };
    const options = { fetch: fetch as typeof globalThis.fetch };
    expect((await proxyAnalysisRequest({ ...request(), method: "GET", body }, enabledConfig, options))?.status).toBe(405);
    expect((await proxyAnalysisRequest({ ...request(), endpoint: "other", body }, enabledConfig, options))?.status).toBe(404);
    expect((await proxyAnalysisRequest({ ...request(), contentType: "audio/wav", body }, enabledConfig, options))?.status).toBe(415);
    expect(read).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts RFC-compatible bare and quoted multipart boundaries", () => {
    expect(parseMultipartContentType(contentType)).toBe("fixture-boundary");
    expect(parseMultipartContentType('multipart/form-data; boundary="fixture boundary+1"')).toBe("fixture boundary+1");
    expect(parseMultipartContentType('multipart/form-data; boundary="bad boundary "')).toBeNull();
    expect(parseMultipartContentType("multipart/form-data")).toBeNull();
  });

  it("accepts at the total request limit and forwards bytes and credential exactly once", async () => {
    const payload = new Uint8Array([4, 3, 2, 1]);
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Uint8Array(init?.body as ArrayBuffer)).toEqual(payload);
      expect(new Headers(init?.headers).get("X-API-Key")).toBe("server-secret");
      expect(new Headers(init?.headers).get("Content-Type")).toBe(contentType);
      return new Response('{"bpm":120}', { headers: { "Content-Type": "application/json" } });
    });
    const below = await proxyAnalysisRequest(request(payload), enabledConfig, {
      fetch: fetch as typeof globalThis.fetch,
      maxRequestBytes: payload.byteLength + 1,
    });
    const at = await proxyAnalysisRequest(request(payload), enabledConfig, {
      fetch: fetch as typeof globalThis.fetch,
      maxRequestBytes: payload.byteLength,
    });
    expect(below).toEqual({ status: 200, contentType: "application/json", body: '{"bpm":120}' });
    expect(at).toEqual(below);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith("https://analysis.invalid/analyze/rhythm", expect.any(Object));
  });

  it("rejects declared and streamed overruns even with a misleading content length", async () => {
    const fetch = vi.fn();
    const declared = await proxyAnalysisRequest(
      { ...request(), contentLength: "5" },
      enabledConfig,
      { fetch: fetch as typeof globalThis.fetch, maxRequestBytes: 4 },
    );
    const streamed = await proxyAnalysisRequest(
      { ...request(), contentLength: "1", body: stream(new Uint8Array(4), new Uint8Array(1)) },
      enabledConfig,
      { fetch: fetch as typeof globalThis.fetch, maxRequestBytes: 4 },
    );
    expect(declared?.status).toBe(413);
    expect(streamed?.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps timeout and fetch failures to sanitized stable errors", async () => {
    const timeoutFetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("secret URL failure")), { once: true });
    }));
    const timedOut = await proxyAnalysisRequest(request(), enabledConfig, {
      fetch: timeoutFetch as typeof globalThis.fetch,
      timeoutMs: 1,
    });
    const failed = await proxyAnalysisRequest(request(), enabledConfig, {
      fetch: vi.fn(async () => { throw new Error("server-secret https://analysis.invalid"); }),
    });
    expect(timedOut?.status).toBe(504);
    expect(timedOut?.body).toContain("upstream_timeout");
    expect(failed?.status).toBe(502);
    expect(failed?.body).not.toContain("server-secret");
    expect(failed?.body).not.toContain("analysis.invalid");
  });

  it("bounds upstream responses and never reflects upstream error bodies", async () => {
    const oversized = await proxyAnalysisRequest(request(), enabledConfig, {
      fetch: vi.fn(async () => new Response('{"too":"large"}', {
        headers: { "Content-Type": "application/json" },
      })),
      maxResponseBytes: 4,
    });
    const rejected = await proxyAnalysisRequest(request(), enabledConfig, {
      fetch: vi.fn(async () => new Response("server-secret internal stack", { status: 500 })),
    });
    expect(oversized?.status).toBe(502);
    expect(oversized?.body).toContain("upstream_response_too_large");
    expect(rejected?.body).not.toContain("server-secret");
    expect(rejected?.body).toContain("upstream_unavailable");
  });

  it("rejects excess concurrency without an additional upstream call", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const fetch = vi.fn(async () => {
      await pending;
      return new Response("{}", { headers: { "Content-Type": "application/json" } });
    });
    const first = proxyAnalysisRequest(request(), enabledConfig, {
      fetch: fetch as typeof globalThis.fetch,
      maxConcurrentRequests: 1,
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const second = await proxyAnalysisRequest(request(), enabledConfig, {
      fetch: fetch as typeof globalThis.fetch,
      maxConcurrentRequests: 1,
    });
    expect(second?.status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it("returns no response after a client abort", async () => {
    const abort = new AbortController();
    const fetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const pending = proxyAnalysisRequest({ ...request(), signal: abort.signal }, enabledConfig, {
      fetch: fetch as typeof globalThis.fetch,
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    abort.abort();
    await expect(pending).resolves.toBeNull();
  });

  it("stops waiting for a request stream after a client abort", async () => {
    const abort = new AbortController();
    const body = {
      async *[Symbol.asyncIterator]() {
        await new Promise(() => undefined);
        yield new Uint8Array();
      },
    };
    const pending = proxyAnalysisRequest({ ...request(), body, signal: abort.signal }, enabledConfig, {
      fetch: vi.fn() as unknown as typeof globalThis.fetch,
    });
    abort.abort();
    await expect(pending).resolves.toBeNull();
  });
});
