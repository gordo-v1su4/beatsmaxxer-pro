import type { IncomingMessage, ServerResponse } from "node:http";
import { analysisProxyConfigFromEnv, proxyAnalysisRequest } from "./policy.js";

export const analysisHandlerConfig = { api: { bodyParser: false }, maxDuration: 120 };

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function handleAnalysisProxy(
  req: IncomingMessage,
  res: ServerResponse,
  endpoint: string,
) {
  const startedAt = Date.now();
  const clientAbort = new AbortController();
  const onAborted = () => clientAbort.abort();
  req.once("aborted", onAborted);

  try {
    const result = await proxyAnalysisRequest(
      {
        method: req.method,
        endpoint,
        contentType: req.headers["content-type"],
        contentLength: req.headers["content-length"],
        idempotencyKey: firstHeader(req.headers["idempotency-key"]),
        origin: firstHeader(req.headers.origin),
        host: firstHeader(req.headers.host) ?? firstHeader(req.headers["x-forwarded-host"]),
        forwardedProto: firstHeader(req.headers["x-forwarded-proto"]),
        fetchSite: firstHeader(req.headers["sec-fetch-site"]),
        referer: firstHeader(req.headers.referer),
        cookieHeader: firstHeader(req.headers.cookie),
        body: req,
        signal: clientAbort.signal,
      },
      analysisProxyConfigFromEnv(process.env),
    );
    if (!result || res.destroyed || res.writableEnded) return;
    res.statusCode = result.status;
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (result.status === 405) {
      res.setHeader("Allow", endpoint.startsWith("studio/jobs/") ? "GET" : "POST");
    }
    res.end(result.body);
    console.info("[analysis-proxy] completed", {
      endpoint,
      status: result.status,
      durationMs: Date.now() - startedAt,
    });
  } finally {
    req.off("aborted", onAborted);
  }
}
