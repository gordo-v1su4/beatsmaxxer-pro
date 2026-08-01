import type { IncomingMessage, ServerResponse } from "node:http";
import { analysisProxyConfigFromEnv, proxyAnalysisRequest } from "./policy";

export const config = { api: { bodyParser: false } };

type RouteRequest = IncomingMessage & { query: { endpoint?: string | string[] } };

export default async function handler(req: RouteRequest, res: ServerResponse) {
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
        body: req,
        signal: clientAbort.signal,
      },
      analysisProxyConfigFromEnv(process.env),
    );
    if (!result || res.destroyed || res.writableEnded) return;
    res.statusCode = result.status;
    res.setHeader("Content-Type", result.contentType);
    if (result.status === 405) res.setHeader("Allow", "POST");
    res.end(result.body);
  } finally {
    req.off("aborted", onAborted);
  }
}
