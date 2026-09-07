import type { IncomingMessage, ServerResponse } from "node:http";
import { proxyStorageUpload, storageGatewayConfigFromEnv } from "./policy.js";

export const storageHandlerConfig = { api: { bodyParser: false }, maxDuration: 60 };

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function handleStorageUpload(
  req: IncomingMessage,
  res: ServerResponse,
  gatewayConfig = storageGatewayConfigFromEnv(process.env),
) {
  const clientAbort = new AbortController();
  const onAborted = () => clientAbort.abort();
  req.once("aborted", onAborted);

  try {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    const result = await proxyStorageUpload(
      {
        method: req.method,
        contentType: req.headers["content-type"],
        contentLength: req.headers["content-length"],
        origin: firstHeader(req.headers.origin),
        host: firstHeader(req.headers.host) ?? firstHeader(req.headers["x-forwarded-host"]),
        forwardedProto: firstHeader(req.headers["x-forwarded-proto"]),
        fetchSite: firstHeader(req.headers["sec-fetch-site"]),
        referer: firstHeader(req.headers.referer),
        cookieHeader: firstHeader(req.headers.cookie),
        uploadId: requestUrl.searchParams.get("uploadId") ?? undefined,
        chunkIndex: requestUrl.searchParams.get("chunkIndex") ?? undefined,
        filename: requestUrl.searchParams.get("filename") ?? undefined,
        body: req,
        signal: clientAbort.signal,
      },
      gatewayConfig,
      {},
      undefined,
      process.env.NODE_ENV === "development" ? "development" : "production",
    );
    if (!result || res.destroyed || res.writableEnded) return;
    res.statusCode = result.status;
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (result.status === 405) res.setHeader("Allow", "POST");
    res.end(result.body);
  } finally {
    req.off("aborted", onAborted);
  }
}
