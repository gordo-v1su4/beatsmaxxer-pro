import type { IncomingMessage, ServerResponse } from "node:http";
import { analysisHandlerConfig, handleAnalysisProxy } from "./handler.js";

export const config = analysisHandlerConfig;

type RouteRequest = IncomingMessage & { query: { endpoint?: string | string[] } };

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: RouteRequest, res: ServerResponse) {
  const endpoint = firstQueryValue(req.query.endpoint)?.trim() ?? "";
  await handleAnalysisProxy(req, res, endpoint);
}
