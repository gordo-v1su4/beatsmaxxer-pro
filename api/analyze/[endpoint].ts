import type { IncomingMessage, ServerResponse } from "node:http";
// Extension is required: the repo is "type": "module" and Vercel compiles this
// function with node16 resolution. TypeScript maps ./policy.js to ./policy.ts.
import { analysisProxyConfigFromEnv, proxyAnalysisRequest } from "./policy.js";

export const config = { api: { bodyParser: false } };

type RouteRequest = IncomingMessage & { query: { endpoint?: string | string[] } };

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: RouteRequest, res: ServerResponse) {
  const startedAt = Date.now();
  const clientAbort = new AbortController();
  const onAborted = () => clientAbort.abort();
  req.once("aborted", onAborted);

  try {
    const endpoint = Array.isArray(req.query.endpoint) ? req.query.endpoint[0] : req.query.endpoint;
    const result = await proxyAnalysisRequest(
      {
        method: req.method,
        endpoint,
        contentType: req.headers["content-type"],
        contentLength: req.headers["content-length"],
        origin: firstHeader(req.headers.origin),
        host: firstHeader(req.headers.host) ?? firstHeader(req.headers["x-forwarded-host"]),
        forwardedProto: firstHeader(req.headers["x-forwarded-proto"]),
        fetchSite: firstHeader(req.headers["sec-fetch-site"]),
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
    if (result.status === 405) res.setHeader("Allow", "POST");
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
