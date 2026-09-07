import type { IncomingMessage, ServerResponse } from "node:http";
import { analysisHandlerConfig, handleAnalysisProxy } from "../../handler.js";

export const config = analysisHandlerConfig;

type RouteRequest = IncomingMessage & { query: { id?: string | string[] } };

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: RouteRequest, res: ServerResponse) {
  const jobId = firstQueryValue(req.query.id)?.trim();
  if (!jobId) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ code: "not_found", detail: "Analysis endpoint not found." }));
    return;
  }
  await handleAnalysisProxy(req, res, `studio/jobs/${jobId}`);
}
